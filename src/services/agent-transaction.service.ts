import { inject, injectable } from "inversify";
import { AgentPaymentExecutionRequestDto, AgentPaymentExecutionResult, AgentPaymentRequestDto } from "@models/dtos/agent-transaction";
import { IAgentTransactionService } from "@hash-types/interfaces/agent-transaction-service.interface";
import { AgentTransactionExecutionValidator } from "validators/agent-transaction-execution-validator";
import { BlockchainClientService } from "./blockchain-client.service";
import { CryptoPaymentStatus, NetworkTypeAlias } from "@hashtrion/application/hash-protocol";
import { ErrorResponse } from "@hashtrion/common/error-response";
import { HttpStatus } from "@hashtrion/common/types/common-variables";
import { SigningAPIEndpointService } from "./signing-api-endpoint.service";
import { BlockchainResultInterpreter, PaymentCompletionBuilder, PaymentExecutionMapper } from "blockchains/blockchain.helper";
import { PaymentStatusReult } from "blockchains/blockchain.enum";
import { CryptoPaymentRepository } from "@repositories/crypto-payment.repository";
import { PaymentExecutionContextRepository } from "@repositories/payment-excution-context.repository";
import { CompletePaymentData, PaymentExecutionResult, PaymentTransactionVerificationResult, StandardizedSubmitResult } from "@models/dtos/payment";

@injectable()
export class AgentTransactionService
    implements IAgentTransactionService {

    constructor(
        @inject(AgentTransactionExecutionValidator) private agentTransactionExecutionValidator: AgentTransactionExecutionValidator,
        @inject(BlockchainClientService) private blockchainClientService: BlockchainClientService,
        @inject(SigningAPIEndpointService) private signingAPIService: SigningAPIEndpointService,
        @inject(CryptoPaymentRepository) private readonly cryptoPaymentRepository: CryptoPaymentRepository,
        @inject(PaymentExecutionContextRepository) private readonly paymentExecutionContextRepository: PaymentExecutionContextRepository
    ) { }

    async createPayment(dto: AgentPaymentExecutionRequestDto): Promise<AgentPaymentExecutionResult> {

        const validatedDto = this.agentTransactionExecutionValidator.validateExecutionRequest(dto);

        const payment = await this.cryptoPaymentRepository.getPaymentById(validatedDto.paymentId);

        const validatedPayment = this.agentTransactionExecutionValidator.validateAgentPayment(payment);

        const signingContext = await this.paymentExecutionContextRepository.getActiveAgentSigningContext(validatedDto.agentAccountId);

        const validatedSigningContext = this.agentTransactionExecutionValidator.validateSigningContext(
            validatedDto, validatedPayment, signingContext);

        const pricingSnapshot = this.agentTransactionExecutionValidator.validatePaymentDetails(validatedPayment);

        const selectedToken = this.agentTransactionExecutionValidator.resolvePaymentToken(validatedPayment, pricingSnapshot);

        const transactionRequest: AgentPaymentRequestDto = {
            requestId: validatedPayment.id,
            agentAccountId: validatedDto.agentAccountId,
            destination: validatedPayment.receiverAddress!,
            amount: validatedPayment.paymentAmount!,
            token: {
                symbol: selectedToken.symbol,
                currencyCode: selectedToken.currencyCode ?? null,
                issuerAddress: selectedToken.issuerAddress ?? null,
                isNative: selectedToken.isNative
            },
            memo: validatedPayment.paymentCode ?? undefined
        };

        const validatedTransactionRequest = this.agentTransactionExecutionValidator.validatePaymentRequest(transactionRequest);

        const network = validatedPayment.blockchainNetwork as NetworkTypeAlias;

        if (network !== NetworkTypeAlias.XRPL) {
            throw new ErrorResponse("Agent payment currently supports XRPL only.", HttpStatus.BAD_REQUEST);
        }

        this.agentTransactionExecutionValidator.validatePaymentExecution(
            validatedTransactionRequest, validatedSigningContext.publicAddress, network);

        const preparedTransaction = await this.blockchainClientService.prepareAgentPaymentTransaction(
            validatedTransactionRequest, validatedSigningContext.publicAddress, network);

        this.agentTransactionExecutionValidator.validatePreparedTransaction(
            preparedTransaction,
            validatedTransactionRequest,
            validatedSigningContext.publicAddress
        );

        const signingResult = await this.signingAPIService.signAgentTransaction({
            chainId: validatedSigningContext.chainId,
            providerKeyReference: validatedSigningContext.providerKeyReference,
            publicKey: validatedSigningContext.publicKey,
            transaction: preparedTransaction.transaction
        });

        const signedPayload = this.agentTransactionExecutionValidator.validateSigningResult(signingResult);

        this.agentTransactionExecutionValidator.validateSignedTransaction(signedPayload,
            preparedTransaction, validatedSigningContext.publicKey
        );

        const txHash = this.blockchainClientService.getTransactionHash(signedPayload, network);

        const decodedTransaction = this.blockchainClientService.decodePayload(signedPayload, network);

        await this.cryptoPaymentRepository.markPendingForSubmission(
            validatedPayment.id, network, txHash, decodedTransaction.asset, validatedTransactionRequest.amount,
            decodedTransaction.fee, decodedTransaction.source, decodedTransaction.destination
        );

        let submitResult: StandardizedSubmitResult;

        try {
            submitResult = await this.blockchainClientService.submitAndWait(signedPayload, network);
        } catch {
            // Submission result is uncertain. Keep the payment PENDING.
            return await this.resolvePendingAgentPayment(
                validatedPayment.id,
                validatedDto.agentAccountId,
                network,
                txHash
            );
        }

        if (!submitResult.txHash || submitResult.txHash.trim().toLowerCase() !== txHash.trim().toLowerCase()) {

            // Submission result is uncertain. Keep the payment PENDING.
            return await this.resolvePendingAgentPayment(
                validatedPayment.id,
                validatedDto.agentAccountId,
                network,
                txHash
            );
        }

        const isSuccess = BlockchainResultInterpreter.isSuccess(submitResult.network, submitResult.blockchainResultCode);

        if (!isSuccess) {

            const reason = `Blockchain transaction failed: ${submitResult.blockchainResultCode}`;

            await this.cryptoPaymentRepository.markAsFailed(validatedPayment.id, reason);

            throw new ErrorResponse(reason, HttpStatus.BAD_REQUEST);
        }

        let executionResult: PaymentExecutionResult;
        let completionData: CompletePaymentData;

        try {
            executionResult = PaymentExecutionMapper.toExecutionResult(submitResult);

            completionData = PaymentCompletionBuilder.build(validatedPayment, decodedTransaction, submitResult, pricingSnapshot,
                {
                    token: selectedToken,
                    amount: validatedTransactionRequest.amount
                }
            );

        } catch (error) {

            console.error("Agent payment completion data preparation failed.", {
                paymentId: validatedPayment.id,
                txHash,
                error: error instanceof Error ? error.message : String(error)
            });

            // Blockchain succeeded, but completion data could not be prepared.
            // Reconcile using the original transaction hash.
            return await this.resolvePendingAgentPayment(
                validatedPayment.id,
                validatedDto.agentAccountId,
                network,
                txHash
            );
        }

        // Complete payment only after confirmed blockchain success.
        try {
            await this.cryptoPaymentRepository.completePayment(completionData);
        } catch {
            const latestPayment = await this.cryptoPaymentRepository.getPaymentById(validatedPayment.id);

            if (latestPayment?.status === CryptoPaymentStatus.PAID &&
                latestPayment.blockchainTxHash?.trim().toLowerCase() === txHash.trim().toLowerCase()) {
                return {
                    requestId: validatedPayment.id,
                    agentAccountId: validatedDto.agentAccountId,
                    ...executionResult
                };
            }

            return await this.resolvePendingAgentPayment(
                validatedPayment.id,
                validatedDto.agentAccountId,
                network,
                txHash
            );
        }

        return {
            requestId: validatedPayment.id,
            agentAccountId: validatedDto.agentAccountId,
            ...executionResult
        };
    }

    public async reconcilePendingAgentPayment(paymentId: string): Promise<PaymentTransactionVerificationResult> {

        const payment = await this.cryptoPaymentRepository.getPaymentById(paymentId);

        const validatedPayment =
            this.agentTransactionExecutionValidator.validatePendingAgentPayment(payment);

        const network = validatedPayment.blockchainNetwork as NetworkTypeAlias;
        const txHash = validatedPayment.blockchainTxHash!;

        let verification: PaymentTransactionVerificationResult;

        try {
            verification = await this.blockchainClientService.verifyPaymentTransactionByHash(txHash, network);

        } catch (error: unknown) {
            return {
                status: PaymentStatusReult.PENDING,
                reason: error instanceof Error
                    ? `Unable to verify blockchain transaction: ${error.message}`
                    : "Unable to verify blockchain transaction."
            };
        }

        if (verification.status === PaymentStatusReult.PENDING) {
            return verification;
        }

        if (verification.status === PaymentStatusReult.FAILED) {

            const reason = verification.reason || "Blockchain transaction failed.";

            try {
                await this.cryptoPaymentRepository.markAsFailed(validatedPayment.id, reason);

                return verification;

            } catch {
                const latestPayment = await this.cryptoPaymentRepository.getPaymentById(validatedPayment.id);

                if (
                    latestPayment?.status === CryptoPaymentStatus.FAILED &&
                    latestPayment.blockchainTxHash?.toLowerCase() === txHash.toLowerCase()
                ) {
                    return verification;
                }

                return {
                    status: PaymentStatusReult.PENDING,
                    reason: "Blockchain failure was confirmed, but payment state reconciliation is still pending."
                };
            }
        }

        if (verification.status === PaymentStatusReult.SUCCESS) {

            let completionData: CompletePaymentData;

            try {
                if (!verification.result) {
                    throw new Error("Missing blockchain verification result.");
                }

                const snapshot = this.agentTransactionExecutionValidator.validatePaymentDetails(validatedPayment);

                const selectedToken = this.agentTransactionExecutionValidator.resolvePaymentToken(validatedPayment, snapshot);

                // Verify the selected asset against the confirmed blockchain transaction.
                this.agentTransactionExecutionValidator.validateReconciledAgentAsset(verification.result, selectedToken);

                completionData = PaymentCompletionBuilder.buildFromPendingPayment(validatedPayment, verification.result, snapshot);

            } catch (error) {
                return {
                    status: PaymentStatusReult.PENDING,
                    reason: "Blockchain payment succeeded, but completion data validation is pending."
                };
            }

            try {
                await this.cryptoPaymentRepository.completePayment(completionData);

                return verification;

            } catch {

                const latestPayment = await this.cryptoPaymentRepository.getPaymentById(validatedPayment.id);

                if (latestPayment?.status === CryptoPaymentStatus.PAID &&
                    latestPayment.blockchainTxHash?.toLowerCase() === txHash.toLowerCase()
                ) {
                    return verification;
                }

                return {
                    status: PaymentStatusReult.PENDING,
                    reason: "Blockchain success was confirmed, but payment record reconciliation is still pending."
                };
            }
        }

        throw new ErrorResponse(
            "Unexpected agent payment verification status.",
            HttpStatus.INTERNAL_SERVER_ERROR
        );

    }

    private async resolvePendingAgentPayment(paymentId: string, agentAccountId: string,
        network: NetworkTypeAlias, txHash: string
    ): Promise<AgentPaymentExecutionResult> {

        const verification = await this.reconcilePendingAgentPayment(paymentId);

        switch (verification.status) {

            case PaymentStatusReult.SUCCESS:
                return {
                    requestId: paymentId,
                    agentAccountId,
                    ...PaymentExecutionMapper.toExecutionResult(verification.result)
                };

            case PaymentStatusReult.FAILED:
                throw new ErrorResponse(
                    verification.reason || "Blockchain transaction failed.",
                    HttpStatus.BAD_REQUEST
                );

            case PaymentStatusReult.PENDING:
                return {
                    requestId: paymentId,
                    agentAccountId,
                    network,
                    txHash,
                    resultCode: PaymentStatusReult.PENDING
                };

            default:
                throw new ErrorResponse(
                    "Unexpected agent payment reconciliation status.",
                    HttpStatus.INTERNAL_SERVER_ERROR
                );
        }
    }
}
