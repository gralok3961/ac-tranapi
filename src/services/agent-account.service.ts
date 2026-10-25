import { AgentAccountRevocationContextRequestDto, AgentAccountRevocationContextResponseDto, RevokeAgentAccountRequestDto, RevokeAgentAccountResponseDto } from "@models/dtos/agent-account";
import {
    ActivateAgentAccountRequestDto,
    ActivateAgentAccountResponseDto,
    AgentAccountChallengeRequestDto,
    AgentAccountChallengeResponseDto,
    AgentAccountChallengeVerifyRequestDto,
    GetAgentAccountAccessStateRequestDto,
    GetAgentAccountAccessStateResponseDto,
    ProvisionAgentAccountAccessResponseDto,
    SaveAgentSpendingPolicyRequestDto,
    SaveAgentSpendingPolicyResponseDto
} from "@models/dtos/agent-account";
import { AgentAccountExecutionValidator } from "validators/agent-account-execution-validator";
import { PlatformAPIEndpointService } from "./platform-api-endpoint.service";
import { BlockchainClientService } from "./blockchain-client.service";
import { inject, injectable } from "inversify";
import { IBlockchainClientService } from "interfaces/BlockchainClientService";
import { HttpStatus } from "@hashtrion/common/types/common-variables";
import { ErrorResponse } from "@hashtrion/common/error-response";
import { AgentSigningAuthorityStatus, BlockChainId, NetworkTypeAlias } from "@hashtrion/application/hash-protocol";
import { XRPLTransactionTypes } from "blockchains/xrpl/xrpl-type";
import { buildAgentSpendingPolicySigningMessage } from "helpers/agent-spending-policy-signing.helper";
import { createHash } from "node:crypto";


@injectable()
export class AgentAccountService {

    constructor(
        @inject(PlatformAPIEndpointService)
        private platformAPIService: PlatformAPIEndpointService,

        @inject(BlockchainClientService)
        private blockchainClientService: IBlockchainClientService,

        @inject(AgentAccountExecutionValidator)
        private agentAccountExecutionValidator: AgentAccountExecutionValidator
    ) { }

    async issueAgentAccountChallenge(dto: AgentAccountChallengeRequestDto, appInstallationId: string): Promise<AgentAccountChallengeResponseDto> {

        const validatedDto = this.agentAccountExecutionValidator.validateIssueAgentAccountChallengeRequest(dto);

        const network = this.blockchainClientService.getNetworkByCahinId(validatedDto.chainId);

        if (!this.blockchainClientService.isValidAddress(validatedDto.publicAddress, network)) {
            throw new ErrorResponse("Invalid blockchain address.", HttpStatus.BAD_REQUEST);
        }

        return await this.platformAPIService.issueAgentAccountChallenge({
            appInstallationId,
            chainId: validatedDto.chainId,
            publicAddress: validatedDto.publicAddress
        });
    }

    async provisionAgentAccountAccess(dto: AgentAccountChallengeVerifyRequestDto, appInstallationId: string):
        Promise<ProvisionAgentAccountAccessResponseDto> {

        const validatedDto =
            this.agentAccountExecutionValidator.validateVerifyAgentAccountChallengeRequest(dto);

        const challengeDetail =
            await this.platformAPIService.getAgentAccountChallengeByChallengeId(validatedDto.challengeId);

        this.agentAccountExecutionValidator.validateFetchedAgentAccountChallenge(
            challengeDetail, appInstallationId, validatedDto.publicAddress
        );

        const network = this.blockchainClientService.getNetworkByCahinId(challengeDetail.chainId);

        const verified =
            await this.blockchainClientService.verifyChallengeSignature(
                {
                    challenge: challengeDetail.challenge,
                    address: validatedDto.publicAddress,
                    publicKey: validatedDto.publicKey,
                    signature: validatedDto.signature
                },
                network
            );

        if (!verified) {
            throw new ErrorResponse(
                "Challenge signature verification failed.", HttpStatus.BAD_REQUEST
            );
        }
        const provisionResult =
            await this.platformAPIService.provisionAgentAccountAccess({
                challengeId: validatedDto.challengeId,
                appInstallationId: appInstallationId,
                publicKey: validatedDto.publicKey,
                signature: validatedDto.signature
            });

        return provisionResult;
    }
    async getAgentAccountRevocationContext(dto: AgentAccountRevocationContextRequestDto,
        appInstallationId: string): Promise<AgentAccountRevocationContextResponseDto> {
        const validated = this.agentAccountExecutionValidator.validateGetAgentAccountAccessStateRequest(dto);
        this.agentAccountExecutionValidator.validateAgentAccountAccessStateTimestamp(validated.timestamp, 120);
        if (validated.chainId !== BlockChainId.XRPL ||
            !this.blockchainClientService.isValidAddress(validated.publicAddress, NetworkTypeAlias.XRPL) ||
            !this.blockchainClientService.isValidAddress(dto.delegatedAuthorityIdentifier, NetworkTypeAlias.XRPL)) {
            throw new ErrorResponse("Invalid Agent revocation account.", HttpStatus.BAD_REQUEST);
        }
        const verified = await this.blockchainClientService.verifyChallengeSignature({
            address: validated.publicAddress, publicKey: validated.publicKey, signature: validated.signature,
            challenge: `REVOKE_AGENT_CONTEXT|${validated.chainId}|${validated.publicAddress}|${dto.delegatedAuthorityIdentifier}|${validated.timestamp}`
        }, NetworkTypeAlias.XRPL);
        if (!verified) throw new ErrorResponse("Agent Account signature verification failed.", HttpStatus.BAD_REQUEST);
        return await this.platformAPIService.getAgentAccountRevocationContext({
            chainId: validated.chainId, publicAddress: validated.publicAddress,
            delegatedAuthorityIdentifier: dto.delegatedAuthorityIdentifier, appInstallationId
        });
    }

    async revokeAgentAccount(dto: RevokeAgentAccountRequestDto, appInstallationId: string): Promise<RevokeAgentAccountResponseDto> {
        const request = this.agentAccountExecutionValidator.validateRevokeAgentAccountRequest(dto);
        const context = await this.platformAPIService.getAgentAccountRevocationContext({
            agentAccountId: request.agentAccountId, signingAuthorityId: request.signingAuthorityId,
            chainId: request.chainId, publicAddress: request.publicAddress,
            delegatedAuthorityIdentifier: request.delegatedAuthorityIdentifier, appInstallationId
        });
        if (context.agentAccountId.toLowerCase() !== request.agentAccountId.toLowerCase() ||
            context.signingAuthorityId.toLowerCase() !== request.signingAuthorityId.toLowerCase() ||
            context.appInstallationId.toLowerCase() !== appInstallationId.toLowerCase() ||
            context.chainId !== request.chainId || context.publicAddress !== request.publicAddress ||
            context.delegatedAuthorityIdentifier !== request.delegatedAuthorityIdentifier ||
            (context.isRevoked ? context.signingAuthorityStatus !== AgentSigningAuthorityStatus.Revoked :
                context.signingAuthorityStatus !== AgentSigningAuthorityStatus.Active)) {
            throw new ErrorResponse("Agent revocation context does not match the request.", HttpStatus.FORBIDDEN);
        }

        const result = await this.blockchainClientService.revokeAgentSigningAuthority(request, context);
        // The chain may already be final. A failed HTTP response is retried using this same hash and target.
        const completed = await this.platformAPIService.revokeAgentAccount({
            agentAccountId: context.agentAccountId, signingAuthorityId: context.signingAuthorityId,
            appInstallationId, chainId: context.chainId, publicAddress: context.publicAddress,
            delegatedAuthorityIdentifier: context.delegatedAuthorityIdentifier,
            txHash: result.txHash, ledgerIndex: result.ledgerIndex
        });
        if (completed.agentAccountId.toLowerCase() !== context.agentAccountId.toLowerCase() ||
            completed.signingAuthorityId.toLowerCase() !== context.signingAuthorityId.toLowerCase() ||
            completed.txHash.toUpperCase() !== result.txHash || completed.ledgerIndex !== result.ledgerIndex) {
            throw new ErrorResponse("Revocation synchronization could not be confirmed. Retry the same transaction.", HttpStatus.CONFLICT);
        }
        return completed;
    }

    async activateAgentAccount(dto: ActivateAgentAccountRequestDto, appInstallationId: string):
        Promise<ActivateAgentAccountResponseDto> {

        const validatedDto =
            this.agentAccountExecutionValidator.validateActivateAgentAccountRequest(dto);

        const activationContext =
            await this.platformAPIService.getAgentAccountActivationContext(validatedDto.agentAccountId);

        if (activationContext.appInstallationId !== appInstallationId) {
            throw new ErrorResponse(
                "Agent account does not belong to this app installation.", HttpStatus.FORBIDDEN
            );
        }

        if (activationContext.signingAuthorityStatus === AgentSigningAuthorityStatus.Active) {
            const verified = await this.blockchainClientService.verifyAgentSigningAuthority(
                activationContext.chainId,
                activationContext.publicAddress,
                activationContext.delegatedAuthorityIdentifier
            );

            if (!verified) {
                throw new ErrorResponse(
                    "Agent signing authority does not match the blockchain state.", HttpStatus.CONFLICT
                );
            }

            return {
                agentAccountId: activationContext.agentAccountId,
                publicId: activationContext.publicId,
                delegatedAuthorityIdentifier: activationContext.delegatedAuthorityIdentifier
            };
        }

        if (activationContext.signingAuthorityStatus !== AgentSigningAuthorityStatus.Provisioned) {
            throw new ErrorResponse(
                "Agent signing authority is not available for activation.", HttpStatus.CONFLICT
            );
        }

        const decodedTransaction =
            this.blockchainClientService.decodeAgentAccountActivationTransaction(
                validatedDto.payload,
                activationContext.chainId
            );

        if (decodedTransaction.transactionType !== XRPLTransactionTypes.SetRegularKey) {
            throw new ErrorResponse(
                "Agent activation transaction must be SetRegularKey.", HttpStatus.BAD_REQUEST
            );
        }

        if (decodedTransaction.publicAddress !== activationContext.publicAddress) {
            throw new ErrorResponse(
                "Agent activation transaction account does not match the registered Agent Account.",
                HttpStatus.BAD_REQUEST
            );
        }

        if (decodedTransaction.delegatedAuthorityIdentifier !== activationContext.delegatedAuthorityIdentifier) {
            throw new ErrorResponse(
                "Agent activation RegularKey does not match the provisioned signing authority.",
                HttpStatus.BAD_REQUEST
            );
        }

        const submitResult = await this.blockchainClientService.submitAgentAccountActivationAndWait(
            validatedDto.payload,
            activationContext.chainId
        );

        if (submitResult.blockchainResultCode !== "tesSUCCESS") {
            throw new ErrorResponse(
                `Agent Account activation transaction failed: ${submitResult.blockchainResultCode}`,
                HttpStatus.BAD_REQUEST
            );
        }
        const ledgerVerified = await this.blockchainClientService.verifyAgentSigningAuthority(
            activationContext.chainId,
            activationContext.publicAddress,
            activationContext.delegatedAuthorityIdentifier
        );

        if (!ledgerVerified) {
            throw new ErrorResponse(
                "Agent signing authority could not be confirmed on the blockchain.", HttpStatus.CONFLICT
            );
        }

        const activationResult = await this.platformAPIService.activateAgentSigningAuthority({
            agentAccountId: activationContext.agentAccountId,
            signingAuthorityId: activationContext.signingAuthorityId
        });

        if (activationResult.status !== AgentSigningAuthorityStatus.Active) {
            throw new ErrorResponse(
                "Agent signing authority could not be activated.", HttpStatus.CONFLICT
            );
        }

        return {
            agentAccountId: activationResult.agentAccountId,
            publicId: activationContext.publicId,
            delegatedAuthorityIdentifier: activationContext.delegatedAuthorityIdentifier,
            txHash: submitResult.txHash,
            ledgerIndex: submitResult.ledgerIndex
        };
    }

    async getAgentAccountAccessState(dto: GetAgentAccountAccessStateRequestDto, appInstallationId: string
    ): Promise<GetAgentAccountAccessStateResponseDto> {

        const validatedDto = this.agentAccountExecutionValidator.validateGetAgentAccountAccessStateRequest(dto);
        const allowedWindowSeconds = 120;

        this.agentAccountExecutionValidator.validateAgentAccountAccessStateTimestamp(validatedDto.timestamp, allowedWindowSeconds);

        if (validatedDto.chainId !== BlockChainId.XRPL) {
            throw new ErrorResponse(
                "Unsupported Agent Account network.", HttpStatus.BAD_REQUEST
            );
        }

        const network = NetworkTypeAlias.XRPL;

        if (!this.blockchainClientService.isValidAddress(validatedDto.publicAddress, network)) {
            throw new ErrorResponse(
                "Invalid Agent Account public address.", HttpStatus.BAD_REQUEST
            );
        }

        const signedMessage = `GET_AGENT_POLICY|${validatedDto.chainId}|${validatedDto.publicAddress}|${validatedDto.timestamp}`;

        let verified = false;

        try {
            verified = await this.blockchainClientService.verifyChallengeSignature(
                {
                    challenge: signedMessage,
                    address: validatedDto.publicAddress,
                    publicKey: validatedDto.publicKey,
                    signature: validatedDto.signature
                },
                network
            );
        } catch {
            verified = false;
        }

        if (!verified) {
            throw new ErrorResponse("Agent Account signature verification failed.", HttpStatus.BAD_REQUEST);
        }
        const result = await this.platformAPIService.getAgentAccountAccessState({
            chainId: validatedDto.chainId,
            publicAddress: validatedDto.publicAddress,
            appInstallationId
        });

        return result;
    }

    private async verifySaveAgentSpendingPolicyRequest(dto: SaveAgentSpendingPolicyRequestDto): Promise<SaveAgentSpendingPolicyRequestDto> {

        const validatedDto = this.agentAccountExecutionValidator.validateSaveAgentSpendingPolicyRequest(dto);

        if (validatedDto.chainId !== BlockChainId.XRPL) {
            throw new ErrorResponse(
                "Unsupported Agent Account network.", HttpStatus.BAD_REQUEST
            );
        }

        const network = NetworkTypeAlias.XRPL;

        if (!this.blockchainClientService.isValidAddress(validatedDto.publicAddress, network)) {
            throw new ErrorResponse("Invalid Agent Account address.", HttpStatus.BAD_REQUEST);
        }

        const signingScope = process.env.NODE_ENV?.trim().toLowerCase();

        if (signingScope !== "development" && signingScope !== "production") {
            throw new Error("Agent spending policy signing scope is not configured.");
        }

        const signingMessage = buildAgentSpendingPolicySigningMessage(validatedDto, signingScope);

        console.log(
            "[AgentPolicy] Server Message Hash:",
            createHash("sha256")
                .update(signingMessage, "utf8")
                .digest("hex")
        );

        let verified = false;

        try {
            verified = await this.blockchainClientService.verifyChallengeSignature(
                {
                    challenge: signingMessage,
                    address: validatedDto.publicAddress,
                    publicKey: validatedDto.publicKey,
                    signature: validatedDto.signature
                },
                network
            );
        } catch (error) {
            console.error("[AgentPolicy] Verification exception:", error);
            verified = false;
        }

        if (!verified) {
            console.warn("[AgentPolicy] Signature verified:", verified);

            throw new ErrorResponse(
                "Spending policy signature verification failed.",
                HttpStatus.BAD_REQUEST
            );
        }

        return validatedDto;
    }

    async saveAgentSpendingPolicy(dto: SaveAgentSpendingPolicyRequestDto, appInstallationId: string
    ): Promise<SaveAgentSpendingPolicyResponseDto> {

        const validatedDto = await this.verifySaveAgentSpendingPolicyRequest(dto);

        return await this.platformAPIService.saveAgentSpendingPolicy({
            appInstallationId,
            chainId: validatedDto.chainId,
            publicAddress: validatedDto.publicAddress,
            timestamp: validatedDto.timestamp,
            nonce: validatedDto.nonce,
            policy: validatedDto.policy
        });
    }
}
