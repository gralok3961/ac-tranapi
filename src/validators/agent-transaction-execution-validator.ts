import { inject, injectable } from "inversify";
import {
    AgentPaymentExecutionRequestDto,
    AgentPaymentRequestDto,
    AgentSigningContextDto,
    PreparedAgentPaymentTransaction,
    SignAgentTransactionResponseDto
} from "@models/dtos/agent-transaction";
import { ErrorResponse } from "@hashtrion/common/error-response";
import { HttpStatus } from "@hashtrion/common/types/common-variables";
import { BlockchainClientService } from "@services/blockchain-client.service";
import { BlockChainId, CryptoPaymentSource, CryptoPaymentStatus, FeePolicy, NativeToken, NetworkTypeAlias } from "@hashtrion/application/hash-protocol";
import { isValidUuid } from "./common.validator";
import { CryptoPayment } from "@models/crypto-payment";
import { PricingSnapshotDto, StandardizedSubmitResult } from "@models/dtos/payment";
import { DecimalUtils } from "@hashtrion/common/utils/decimal.utils";
import { decode, encode, Payment, verifySignature, xrpToDrops } from "xrpl";

@injectable()
export class AgentTransactionExecutionValidator {

    constructor(@inject(BlockchainClientService) private blockchainClientService: BlockchainClientService
    ) { }

    validatePaymentRequest(dto: AgentPaymentRequestDto): AgentPaymentRequestDto {

        if (!dto || typeof dto !== "object") {
            throw new ErrorResponse("Invalid agent payment request.", HttpStatus.BAD_REQUEST);
        }

        const requestId = dto.requestId?.trim();
        const agentAccountId = dto.agentAccountId?.trim();
        const destination = dto.destination?.trim();
        const amount = dto.amount?.trim();

        if (!requestId) {
            throw new ErrorResponse("requestId is required.", HttpStatus.BAD_REQUEST);
        }

        if (!isValidUuid(requestId)) {
            throw new ErrorResponse("requestId must be a valid UUID.", HttpStatus.BAD_REQUEST);
        }

        if (!agentAccountId) {
            throw new ErrorResponse("agentAccountId is required.", HttpStatus.BAD_REQUEST);
        }

        if (!isValidUuid(agentAccountId)) {
            throw new ErrorResponse("agentAccountId must be a valid UUID.", HttpStatus.BAD_REQUEST);
        }

        if (!destination) {
            throw new ErrorResponse("destination is required.", HttpStatus.BAD_REQUEST);
        }

        if (!this.isPositiveDecimal(amount)) {
            throw new ErrorResponse("amount must be a positive decimal value.", HttpStatus.BAD_REQUEST);
        }

        if (!dto.token) {
            throw new ErrorResponse("token is required.", HttpStatus.BAD_REQUEST);
        }

        if (typeof dto.token.isNative !== "boolean") {
            throw new ErrorResponse("required and must be a boolean.", HttpStatus.BAD_REQUEST);
        }

        const symbol = dto.token.symbol?.trim();

        if (!symbol) {
            throw new ErrorResponse("token.symbol is required.", HttpStatus.BAD_REQUEST);
        }

        const currencyCode = dto.token.currencyCode?.trim() || null;

        const issuerAddress = dto.token.issuerAddress?.trim() || null;

        if (dto.token.isNative) {

            if (currencyCode || issuerAddress) {
                throw new ErrorResponse("Native token must not include currencyCode or issuerAddress.", HttpStatus.BAD_REQUEST);
            }

        } else {

            if (!currencyCode || !issuerAddress) {
                throw new ErrorResponse("Issued token requires currencyCode and issuerAddress.", HttpStatus.BAD_REQUEST);
            }
        }

        if (dto.destinationTag !== undefined &&
            (
                !Number.isInteger(dto.destinationTag) ||
                dto.destinationTag < 0 ||
                dto.destinationTag > 0xFFFFFFFF
            )
        ) {
            throw new ErrorResponse(
                "destinationTag must be a valid unsigned 32-bit integer.", HttpStatus.BAD_REQUEST
            );
        }

        const memo = dto.memo?.trim();

        return {
            requestId,
            agentAccountId,
            destination,
            amount,
            token: {
                symbol,
                currencyCode,
                issuerAddress,
                isNative: dto.token.isNative
            },
            ...(memo ? { memo } : {}),
            ...(dto.destinationTag !== undefined
                ? { destinationTag: dto.destinationTag }
                : {})
        };
    }

    private isPositiveDecimal(value: string | undefined): value is string {

        if (!value) {
            return false;
        }

        // Positive decimal string only.
        // No exponent, sign, or scientific notation.
        if (!/^\d+(?:\.\d+)?$/.test(value)) {
            return false;
        }

        // Avoid JS floating-point conversion for payment amounts.
        const digits = value.replace(".", "");

        return /[1-9]/.test(digits);
    }

    validatePaymentExecution(dto: AgentPaymentRequestDto, sourceAddress: string, network: NetworkTypeAlias): void {

        this.validateAddress(dto.destination, network, "destination");

        if (!dto.token.isNative) {
            this.validateAddress(dto.token.issuerAddress!, network, "token issuer");
        }

        switch (network) {

            case NetworkTypeAlias.XRPL:
                this.validateXrplPayment(dto, sourceAddress);
                return;

            default:
                throw new ErrorResponse("Unsupported blockchain network.", HttpStatus.BAD_REQUEST);
        }
    }

    private validateAddress(address: string, network: NetworkTypeAlias, fieldName: string): void {

        if (!this.blockchainClientService.isValidAddress(address, network)) {
            throw new ErrorResponse(
                `Invalid ${fieldName} address.`, HttpStatus.BAD_REQUEST
            );
        }
    }

    private validateXrplPayment(dto: AgentPaymentRequestDto, sourceAddress: string): void {

        if (dto.destination === sourceAddress) {
            throw new ErrorResponse(
                "Sender and receiver must be different accounts.", HttpStatus.BAD_REQUEST
            );
        }

        if (dto.token.isNative && dto.token.symbol.toUpperCase() !== NativeToken.XRP) {
            throw new ErrorResponse(
                "XRPL native token must be XRP.", HttpStatus.BAD_REQUEST
            );
        }
    }
    validateExecutionRequest(dto: AgentPaymentExecutionRequestDto): AgentPaymentExecutionRequestDto {

        if (!dto ||
            typeof dto !== "object" ||
            Array.isArray(dto) ||
            typeof dto.paymentId !== "string" ||
            typeof dto.agentAccountId !== "string" ||
            typeof dto.providerKeyReference !== "string" ||
            typeof dto.publicKey !== "string") {
            throw new ErrorResponse(
                "Invalid agent payment request.",
                HttpStatus.BAD_REQUEST
            );
        }

        const paymentId = dto.paymentId?.trim();
        const agentAccountId = dto.agentAccountId?.trim();
        const providerKeyReference = dto.providerKeyReference?.trim();
        const publicKey = dto.publicKey?.trim();

        if (!isValidUuid(paymentId) || !isValidUuid(agentAccountId)) {
            throw new ErrorResponse("Invalid payment or agent account ID.", HttpStatus.BAD_REQUEST);
        }

        if (!providerKeyReference) {
            throw new ErrorResponse("Signing key reference is required.", HttpStatus.BAD_REQUEST);
        }

        if (!publicKey || !/^(02|03)[0-9a-f]{64}$/i.test(publicKey)) {
            throw new ErrorResponse("Invalid signing public key.", HttpStatus.BAD_REQUEST);
        }

        return {
            paymentId,
            agentAccountId,
            providerKeyReference,
            publicKey
        };
    }

    validateAgentPayment(payment: CryptoPayment | null): CryptoPayment {

        if (!payment || payment.paymentSource !== CryptoPaymentSource.AGENT) {
            throw new ErrorResponse("Agent payment not found.", HttpStatus.NOT_FOUND);
        }

        if (payment.status !== CryptoPaymentStatus.CREATED) {
            throw new ErrorResponse(
                "Agent payment is not available for execution.", HttpStatus.CONFLICT
            );
        }

        return payment;
    }

    validateSigningContext(dto: AgentPaymentExecutionRequestDto, payment: CryptoPayment,
        context: AgentSigningContextDto | null): AgentSigningContextDto {

        if (!context ||
            context.agentAccountId.toLowerCase() !== dto.agentAccountId.toLowerCase() ||
            context.publicAddress !== payment.payerAddress ||
            context.providerKeyReference !== dto.providerKeyReference ||
            context.publicKey.toUpperCase() !== dto.publicKey.toUpperCase()) {
            throw new ErrorResponse(
                "Agent signing context does not match the payment.", HttpStatus.FORBIDDEN
            );
        }

        const network = this.blockchainClientService.getNetworkByCahinId(context.chainId as BlockChainId);

        if (payment.blockchainNetwork?.toLowerCase() !== network.toLowerCase()) {
            throw new ErrorResponse(
                "Agent payment network mismatch.", HttpStatus.FORBIDDEN
            );
        }

        return context;
    }

    validatePaymentDetails(payment: CryptoPayment): PricingSnapshotDto {

        if (!payment.receiverAddress ||
            !payment.paymentAsset ||
            !payment.paymentAmount ||
            !payment.paymentCode ||
            !payment.pricingSnapshotJson) {
            throw new ErrorResponse(
                "Agent payment data is incomplete.", HttpStatus.BAD_REQUEST
            );
        }

        const amount = payment.paymentAmount.trim();

        if (!/^\d+(?:\.\d+)?$/.test(amount) ||
            !/[1-9]/.test(amount.replace(".", ""))) {
            throw new ErrorResponse(
                "Invalid agent payment amount.", HttpStatus.BAD_REQUEST
            );
        }

        let snapshot: PricingSnapshotDto;

        try {
            snapshot = JSON.parse(payment.pricingSnapshotJson!) as PricingSnapshotDto;
        } catch {
            throw new ErrorResponse(
                "Invalid pricing snapshot.", HttpStatus.UNPROCESSABLE_ENTITY
            );
        }

        if (!snapshot || !Array.isArray(snapshot.tokens) || snapshot.tokens.length === 0) {
            throw new ErrorResponse(
                "Pricing snapshot has no valid tokens.", HttpStatus.UNPROCESSABLE_ENTITY
            );
        }

        return snapshot;
    }

    resolvePaymentToken(payment: CryptoPayment, snapshot: PricingSnapshotDto): PricingSnapshotDto["tokens"][number] {

        const network = payment.blockchainNetwork?.trim().toLowerCase();
        const symbol = payment.paymentAsset?.trim().toUpperCase();
        const amount = payment.paymentAmount?.trim();

        if (!network || !symbol || !amount) {
            throw new ErrorResponse(
                "Invalid agent payment asset.", HttpStatus.BAD_REQUEST
            );
        }

        const selectedAsset = (snapshot as PricingSnapshotDto & {
            selectedAsset?: {
                networkAlias: string;
                symbol: string;
                currencyCode: string | null;
                issuerAddress: string | null;
            };
        }).selectedAsset;

        // Verify the asset selected by Platform API.
        if (!selectedAsset ||
            selectedAsset.networkAlias?.trim().toLowerCase() !== network ||
            selectedAsset.symbol?.trim().toUpperCase() !== symbol) {
            throw new ErrorResponse(
                "Selected payment asset does not match the payment.",
                HttpStatus.UNPROCESSABLE_ENTITY
            );
        }

        const matches = snapshot.tokens.filter(token =>
            token.networkAlias?.trim().toLowerCase() === network &&
            token.symbol?.trim().toUpperCase() === symbol &&
            token.requiredAmount != null &&
            DecimalUtils.compare(String(token.requiredAmount), amount) === 0 &&

            // Exact token identity
            (token.currencyCode?.trim().toUpperCase() ?? null) ===
            (selectedAsset.currencyCode?.trim().toUpperCase() ?? null) &&

            (token.issuerAddress?.trim() ?? null) ===
            (selectedAsset.issuerAddress?.trim() ?? null)
        );
        // Ensure exactly one matching token in the pricing snapshot.
        if (matches.length !== 1) {
            throw new ErrorResponse(
                "Agent payment token is missing or ambiguous.", HttpStatus.UNPROCESSABLE_ENTITY
            );
        }

        return matches[0];
    }

    validatePreparedTransaction(prepared: PreparedAgentPaymentTransaction, dto: AgentPaymentRequestDto, sourceAddress: string): void {

        switch (prepared.network) {

            case NetworkTypeAlias.XRPL:
                this.validatePreparedXrplTransaction(prepared.transaction as Payment, dto, sourceAddress);
                return;

            default:
                throw new ErrorResponse(
                    "Unsupported blockchain network.",
                    HttpStatus.BAD_REQUEST
                );
        }
    }

    validatePreparedXrplTransaction(tx: Payment, dto: AgentPaymentRequestDto, sourceAddress: string): void {

        if (tx.TransactionType !== "Payment" ||
            tx.Account !== sourceAddress ||
            tx.Destination !== dto.destination) {
            throw new ErrorResponse(
                "Prepared transaction does not match payment details.",
                HttpStatus.BAD_REQUEST
            );
        }

        // Exact amount and asset identity
        const amount = tx.Amount;

        if (dto.token.isNative) {

            if (typeof amount !== "string" ||
                amount !== xrpToDrops(dto.amount)) {
                throw new ErrorResponse(
                    "Prepared XRP amount mismatch.", HttpStatus.BAD_REQUEST
                );
            }

        } else {

            if (typeof amount !== "object" ||
                !("currency" in amount) ||
                !("issuer" in amount) ||
                !("value" in amount) ||
                amount.currency.toUpperCase() !== dto.token.currencyCode!.toUpperCase() ||
                amount.issuer !== dto.token.issuerAddress ||
                DecimalUtils.compare(amount.value, dto.amount) !== 0) {
                throw new ErrorResponse(
                    "Prepared issued token mismatch.",
                    HttpStatus.BAD_REQUEST
                );
            }
        }

        const feePolicy = FeePolicy[NetworkTypeAlias.XRPL];

        if (!tx.Fee ||
            DecimalUtils.compare(tx.Fee, feePolicy.min) < 0 ||
            DecimalUtils.compare(tx.Fee, feePolicy.max) > 0) {
            throw new ErrorResponse(
                "Invalid prepared transaction fee.", HttpStatus.UNPROCESSABLE_ENTITY
            );
        }

        if (
            typeof tx.Sequence !== "number" ||
            !Number.isSafeInteger(tx.Sequence) ||
            tx.Sequence <= 0 ||
            typeof tx.LastLedgerSequence !== "number" ||
            !Number.isSafeInteger(tx.LastLedgerSequence) ||
            tx.LastLedgerSequence <= 0
        ) {
            throw new ErrorResponse(
                "Invalid transaction sequence or ledger expiration.",
                HttpStatus.UNPROCESSABLE_ENTITY
            );
        }

        // Allow only standard payment flags or fully canonical signature flag.
        // Reject Partial Payment and other unexpected flags.
        if (
            tx.Flags !== undefined &&
            (typeof tx.Flags !== "number" ||
                (tx.Flags !== 0 && tx.Flags !== 0x80000000))
        ) {
            throw new ErrorResponse(
                "Unsupported XRPL payment flags.",
                HttpStatus.UNPROCESSABLE_ENTITY
            );
        }

        // Verify PaymentCode memo
        const expectedMemo = dto.memo
            ? Buffer.from(dto.memo, "utf8").toString("hex").toUpperCase()
            : null;

        if (
            !expectedMemo ||
            tx.Memos?.length !== 1 ||
            tx.Memos[0]?.Memo?.MemoData?.toUpperCase() !== expectedMemo
        ) {
            throw new ErrorResponse(
                "Prepared transaction memo mismatch.", HttpStatus.UNPROCESSABLE_ENTITY
            );
        }
    }

    validateSigningResult(result: SignAgentTransactionResponseDto | null | undefined): string {

        if (!result || typeof result.payload !== "string" || !result.payload.trim()) {
            throw new ErrorResponse(
                "Signing API returned an invalid payload.",
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        return result.payload;
    }
    validateSignedTransaction(signedPayload: string, prepared: PreparedAgentPaymentTransaction, expectedPublicKey: string): void {

        switch (prepared.network) {

            case NetworkTypeAlias.XRPL:
                this.validateSignedXrplTransaction(signedPayload, prepared.transaction as Payment, expectedPublicKey);
                return;

            default:
                throw new ErrorResponse(
                    "Unsupported blockchain network.", HttpStatus.BAD_REQUEST
                );
        }
    }

    private validateSignedXrplTransaction(signedPayload: string, preparedTransaction: Payment, expectedPublicKey: string): void {

        try {
            const signed = decode(signedPayload) as unknown as Payment;

            // Verify the expected signing key and cryptographic signature.
            if (
                signed.SigningPubKey?.toUpperCase() !== expectedPublicKey.toUpperCase() ||
                !signed.TxnSignature ||
                !verifySignature(signedPayload, expectedPublicKey)
            ) {
                throw new ErrorResponse(
                    "Invalid agent transaction signature.", HttpStatus.UNPROCESSABLE_ENTITY
                );
            }

            // Remove signature fields before comparing transaction contents.
            const unsigned = { ...signed };

            delete unsigned.SigningPubKey;
            delete unsigned.TxnSignature;

            if (encode(unsigned) !== encode(preparedTransaction)) {
                throw new ErrorResponse(
                    "Signed transaction does not match prepared transaction.", HttpStatus.UNPROCESSABLE_ENTITY
                );
            }

        } catch (error) {

            if (error instanceof ErrorResponse) {
                throw error;
            }

            throw new ErrorResponse(
                "Invalid signed transaction payload.", HttpStatus.UNPROCESSABLE_ENTITY
            );
        }
    }

    validatePendingAgentPayment(payment: CryptoPayment | null): CryptoPayment {

        if (!payment || payment.paymentSource !== CryptoPaymentSource.AGENT) {
            throw new ErrorResponse(
                "Agent payment not found.", HttpStatus.NOT_FOUND
            );
        }

        if (payment.status !== CryptoPaymentStatus.PENDING) {
            throw new ErrorResponse(
                "Agent payment is not pending.", HttpStatus.CONFLICT
            );
        }

        if (!payment.blockchainNetwork || !payment.blockchainTxHash) {
            throw new ErrorResponse(
                "Pending agent payment is missing blockchain recovery information.",
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        if (payment.blockchainNetwork !== NetworkTypeAlias.XRPL) {
            throw new ErrorResponse(
                "Unsupported agent payment blockchain network.",
                HttpStatus.BAD_REQUEST
            );
        }

        return payment;
    }

    validateReconciledAgentAsset(result: StandardizedSubmitResult, selectedToken: PricingSnapshotDto["tokens"][number]): void {

        const normalize = (value?: string | null): string | null =>
            value?.trim() || null;

        const recoveredCurrency = normalize(result.currencyCode);
        const expectedCurrency = normalize(selectedToken.currencyCode);

        const recoveredIssuer = normalize(result.issuerAddress);
        const expectedIssuer = normalize(selectedToken.issuerAddress);

        // Verify the exact asset confirmed on the blockchain.
        if (
            result.network.toLowerCase() !== selectedToken.networkAlias.toLowerCase() ||
            result.paymentAsset?.toUpperCase() !== selectedToken.symbol.toUpperCase() ||
            (recoveredCurrency?.toUpperCase() ?? null) !== (expectedCurrency?.toUpperCase() ?? null) ||
            recoveredIssuer !== expectedIssuer
        ) {
            throw new ErrorResponse(
                "Reconciled agent payment asset does not match the selected asset.", HttpStatus.UNPROCESSABLE_ENTITY
            );
        }
    }
}