import { RevokeAgentAccountRequestDto } from "@models/dtos/agent-account";
import {
    ActivateAgentAccountRequestDto, AgentAccountChallengeDetailResponseDto,
    AgentAccountChallengeRequestDto, AgentAccountChallengeVerifyRequestDto,
    GetAgentAccountAccessStateRequestDto,
    SaveAgentSpendingPolicyRequestDto
} from "@models/dtos/agent-account";
import { HttpStatus } from "@hashtrion/common/types/common-variables";
import { ErrorResponse } from "@hashtrion/common/error-response";
import { injectable } from "inversify";
import { AgentAccountChallengePurpose } from "@hashtrion/application/hash-protocol";
import { isValidUuid } from "./common.validator";

@injectable()
export class AgentAccountExecutionValidator {

    validateRevokeAgentAccountRequest(dto: RevokeAgentAccountRequestDto): RevokeAgentAccountRequestDto {
        if (!dto || !isValidUuid(dto.agentAccountId) || !isValidUuid(dto.signingAuthorityId) ||
            dto.chainId !== 1 || typeof dto.publicAddress !== "string" || !dto.publicAddress.trim() ||
            typeof dto.delegatedAuthorityIdentifier !== "string" || !dto.delegatedAuthorityIdentifier.trim() ||
            typeof dto.txHash !== "string" || !/^[A-Fa-f0-9]{64}$/.test(dto.txHash) ||
            (dto.payload !== undefined && (typeof dto.payload !== "string" || !/^(?:[A-Fa-f0-9]{2})+$/.test(dto.payload)))) {
            throw new ErrorResponse("Invalid Agent Account revocation request.", HttpStatus.BAD_REQUEST);
        }
        return { ...dto, txHash: dto.txHash.toUpperCase() };
    }

    requiredPublicAddress(
        publicAddress: string | undefined | null
    ): string {
        const cleanedPublicAddress = publicAddress?.trim();

        if (!cleanedPublicAddress) {
            throw new ErrorResponse("publicAddress is required.", HttpStatus.BAD_REQUEST);
        }

        return cleanedPublicAddress;
    }

    requiredChainId(chainId: number | undefined | null): number {
        if (!Number.isInteger(chainId) || chainId! <= 0) {
            throw new ErrorResponse("Valid chainId is required.", HttpStatus.BAD_REQUEST);
        }
        return chainId!;
    }

    validateIssueAgentAccountChallengeRequest(dto: AgentAccountChallengeRequestDto): {
        chainId: number;
        publicAddress: string;
    } {
        const chainId = this.requiredChainId(dto.chainId);
        const publicAddress = this.requiredPublicAddress(dto.publicAddress);

        return {
            chainId,
            publicAddress
        };
    }

    requiredChallengeId(challengeId: string | undefined | null): string {
        const cleanedChallengeId = challengeId?.trim();

        if (!cleanedChallengeId) {
            throw new ErrorResponse("challengeId is required.", HttpStatus.BAD_REQUEST);
        }

        return cleanedChallengeId;
    }

    requiredPublicKey(publicKey: string | undefined | null): string {
        const cleanedPublicKey = publicKey?.trim();

        if (!cleanedPublicKey) {
            throw new ErrorResponse("publicKey is required.", HttpStatus.BAD_REQUEST);
        }

        return cleanedPublicKey;
    }

    requiredSignature(signature: string | undefined | null): string {
        const cleanedSignature = signature?.trim();

        if (!cleanedSignature) {
            throw new ErrorResponse("signature is required.", HttpStatus.BAD_REQUEST);
        }

        return cleanedSignature;
    }

    validateVerifyAgentAccountChallengeRequest(
        dto: AgentAccountChallengeVerifyRequestDto
    ): {
        challengeId: string;
        publicAddress: string;
        publicKey: string;
        signature: string;
    } {
        return {
            challengeId: this.requiredChallengeId(dto.challengeId),
            publicAddress: this.requiredPublicAddress(dto.publicAddress),
            publicKey: this.requiredPublicKey(dto.publicKey),
            signature: this.requiredSignature(dto.signature)
        };
    }

    validateFetchedAgentAccountChallenge(
        challengeDetail: AgentAccountChallengeDetailResponseDto,
        appInstallationId: string, publicAddress: string
    ): void {

        if (!challengeDetail.challenge?.trim()) {
            throw new ErrorResponse(
                "Challenge payload is missing.", HttpStatus.BAD_REQUEST
            );
        }

        if (challengeDetail.status !== 0) {
            throw new ErrorResponse(
                "Challenge is not pending.", HttpStatus.BAD_REQUEST
            );
        }

        if (challengeDetail.purpose !== AgentAccountChallengePurpose.RegisterAgentAccount) {
            throw new ErrorResponse(
                "Invalid challenge purpose.", HttpStatus.BAD_REQUEST
            );
        }

        if (challengeDetail.appInstallationId !== appInstallationId) {
            throw new ErrorResponse(
                "Challenge does not belong to this app installation.", HttpStatus.FORBIDDEN
            );
        }

        if (challengeDetail.publicAddress.trim() !== publicAddress.trim()) {
            throw new ErrorResponse(
                "Address does not match challenge.", HttpStatus.BAD_REQUEST
            );
        }

        const expiresAt = new Date(challengeDetail.expiresAt);

        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
            throw new ErrorResponse(
                "Challenge has expired.", HttpStatus.BAD_REQUEST
            );
        }
    }

    requiredAgentAccountId(agentAccountId: string | undefined | null): string {

        const cleanedAgentAccountId = agentAccountId?.trim();

        if (!cleanedAgentAccountId) {
            throw new ErrorResponse("agentAccountId is required.", HttpStatus.BAD_REQUEST);
        }

        if (!isValidUuid(cleanedAgentAccountId)) {
            throw new ErrorResponse("agentAccountId must be a valid UUID.", HttpStatus.BAD_REQUEST);
        }

        return cleanedAgentAccountId;
    }

    requiredPayload(payload: string | undefined | null): string {
        const cleanedPayload = payload?.trim();

        if (!cleanedPayload) {
            throw new ErrorResponse("payload is required.", HttpStatus.BAD_REQUEST);
        }

        return cleanedPayload;
    }

    validateActivateAgentAccountRequest(dto: ActivateAgentAccountRequestDto): {
        agentAccountId: string;
        payload: string;
    } {
        return {
            agentAccountId: this.requiredAgentAccountId(dto.agentAccountId),
            payload: this.requiredPayload(dto.payload)
        };
    }

    validateGetAgentAccountAccessStateRequest(
        dto: GetAgentAccountAccessStateRequestDto
    ): GetAgentAccountAccessStateRequestDto {

        if (!dto ||
            typeof dto.publicAddress !== "string" ||
            typeof dto.publicKey !== "string" ||
            typeof dto.signature !== "string") {
            throw new ErrorResponse(
                "Invalid Agent Account access state request.",
                HttpStatus.BAD_REQUEST
            );
        }

        if (!Number.isSafeInteger(dto.timestamp) || dto.timestamp <= 0) {
            throw new ErrorResponse(
                "Valid timestamp is required.",
                HttpStatus.BAD_REQUEST
            );
        }

        return {
            chainId: this.requiredChainId(dto.chainId),
            publicAddress: this.requiredPublicAddress(dto.publicAddress),
            publicKey: this.requiredPublicKey(dto.publicKey),
            timestamp: dto.timestamp,
            signature: this.requiredSignature(dto.signature)
        };
    }

    validateAgentAccountAccessStateTimestamp(timestamp: number, allowedWindowSeconds: number): void {

        const currentTimestamp = Math.floor(Date.now() / 1000);

        if (Math.abs(currentTimestamp - timestamp) > allowedWindowSeconds) {
            throw new ErrorResponse(
                "Agent Account access request has expired or has an invalid timestamp.", HttpStatus.BAD_REQUEST
            );
        }
    }

    validateSaveAgentSpendingPolicyRequest(dto: SaveAgentSpendingPolicyRequestDto): SaveAgentSpendingPolicyRequestDto {

        if (!dto ||
            typeof dto.publicAddress !== "string" ||
            typeof dto.publicKey !== "string" ||
            typeof dto.signature !== "string") {
            throw new ErrorResponse(
                "Invalid spending policy request.", HttpStatus.BAD_REQUEST
            );
        }

        const chainId = this.requiredChainId(dto.chainId);
        const publicAddress = this.requiredPublicAddress(dto.publicAddress);
        const publicKey = this.requiredPublicKey(dto.publicKey);
        const signature = this.requiredSignature(dto.signature);

        if (!Number.isSafeInteger(dto.timestamp) || dto.timestamp <= 0) {
            throw new ErrorResponse("Invalid timestamp.", HttpStatus.BAD_REQUEST);
        }

        this.validateAgentAccountAccessStateTimestamp(dto.timestamp, 120);

        if (typeof dto.nonce !== "string" ||
            !/^[A-Za-z0-9_-]{16,128}$/.test(dto.nonce)) {
            throw new ErrorResponse("Invalid nonce.", HttpStatus.BAD_REQUEST);
        }

        const policy = dto.policy;

        if (!policy ||
            typeof policy.expiresAt !== "string" ||
            !Array.isArray(policy.assets)) {
            throw new ErrorResponse(
                "Invalid spending policy.", HttpStatus.BAD_REQUEST
            );
        }

        const expiration = Date.parse(policy.expiresAt);

        if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(policy.expiresAt) ||
            !Number.isFinite(expiration) ||
            (policy.assets.length > 0 && expiration <= Date.now())) {
            throw new ErrorResponse(
                "Invalid policy expiration.",
                HttpStatus.BAD_REQUEST
            );
        }

        const assetKeys = new Set<string>();

        for (const asset of policy.assets) {
            if (!asset ||
                typeof asset.currencyCode !== "string" ||
                !asset.currencyCode.trim() ||
                asset.currencyCode.length > 80 ||
                (asset.issuer != null &&
                    (typeof asset.issuer !== "string" ||
                        !asset.issuer.trim() ||
                        asset.issuer.length > 200))) {
                throw new ErrorResponse("Invalid policy asset.", HttpStatus.BAD_REQUEST);
            }

            const amount = asset.perTransactionLimit;

            if (typeof amount !== "string" ||
                !/^(?:0|[1-9]\d{0,19})(?:\.\d{1,18})?$/.test(amount) ||
                !/[1-9]/.test(amount)) {
                throw new ErrorResponse(
                    "Invalid per transaction limit.",
                    HttpStatus.BAD_REQUEST
                );
            }

            const assetKey = JSON.stringify([asset.currencyCode, asset.issuer]);

            if (assetKeys.has(assetKey)) {
                throw new ErrorResponse("Duplicate policy asset.", HttpStatus.BAD_REQUEST);
            }

            assetKeys.add(assetKey);
        }

        return {
            ...dto,
            chainId,
            publicAddress,
            publicKey,
            signature
        };
    }
}