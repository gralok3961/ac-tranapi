import { CompletePaymentData, DecodedPayment, PaymentExecutionResult, PricingSnapshotDto, StandardizedSubmitResult, TokenAmount } from "@models/dtos/payment";
import { NetworkTypeAlias } from "@hashtrion/application/hash-protocol";
import { ErrorResponse } from "@hashtrion/common/error-response";
import { HttpStatus } from "@hashtrion/common/types/common-variables";
import { CryptoPayment } from "@models/crypto-payment";
import { PaymentStatusReult } from "./blockchain.enum";
import { DecimalUtils } from "@hashtrion/common/utils/decimal.utils";

export class BlockchainResultInterpreter {

    static isSuccess(
        network: NetworkTypeAlias,
        code: string
    ): boolean {

        switch (network) {

            case NetworkTypeAlias.XRPL:
                return code === "tesSUCCESS";

            default:
                return false;
        }
    }
}

export class PaymentExecutionMapper {

    static toExecutionResult(submitResult: StandardizedSubmitResult): PaymentExecutionResult {

        if (!submitResult.txHash) {
            throw new Error("Missing txHash in successful transaction.");
        }

        if (!submitResult.deliveredAmount) {
            throw new Error("Missing deliveredAmount in successful transaction.");
        }

        if (!submitResult.feeCharged) {
            throw new Error("Missing feeCharged in successful transaction.");
        }

        return {
            network: submitResult.network,
            txHash: submitResult.txHash,
            ledgerIndex: submitResult.ledgerIndex,
            closeTime: submitResult.createdAt,
            deliveredAmount: submitResult.deliveredAmount,
            feeCharged: submitResult.feeCharged,
            resultCode: PaymentStatusReult.SUCCESS
        };
    }
}

export class PaymentCompletionBuilder {

    static build(
        payment: CryptoPayment,
        decoded: DecodedPayment,
        submitResult: StandardizedSubmitResult,
        snapshot: PricingSnapshotDto,
        tokenAmount: TokenAmount
    ): CompletePaymentData {

        const payer = submitResult.sender ?? decoded.source;
        const receiver = submitResult.destination ?? decoded.destination;

        if (!payer || !receiver) {
            throw new ErrorResponse(
                "Missing payer or receiver address.", HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        return {
            Id: payment.id,
            BlockchainNetwork: submitResult.network,
            PaymentAsset: decoded.asset,
            BlockchainTxHash: submitResult.txHash,
            PaymentFeeNative: submitResult.feeCharged ?? "0",
            PaymentAmount: tokenAmount.amount,
            PayerAddress: payer,
            ReceiverAddress: receiver,
            FxRate: tokenAmount.token.unitPrice,
            FxProvider: snapshot.provider,
            FxCapturedAt: snapshot.capturedAt,
            SettlementCurrency: payment.checkoutCurrency,
            SettlementAmount: payment.checkoutAmount.toString()
        };
    }

    static buildFromPendingPayment(payment: CryptoPayment, submitResult: StandardizedSubmitResult, snapshot: PricingSnapshotDto
    ): CompletePaymentData {

        if (
            !payment.blockchainNetwork ||
            !payment.blockchainTxHash ||
            !payment.paymentAsset ||
            !payment.paymentAmount ||
            !payment.paymentFeeNative ||
            !payment.payerAddress ||
            !payment.receiverAddress
        ) {
            throw new ErrorResponse(
                "Pending payment is missing blockchain execution data.",
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        if (
            submitResult.txHash.trim().toLowerCase() !==
            payment.blockchainTxHash.trim().toLowerCase()
        ) {
            throw new ErrorResponse(
                "Recovered blockchain transaction hash mismatch.",
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        if (
            submitResult.network.toLowerCase() !==
            payment.blockchainNetwork.toLowerCase()
        ) {
            throw new ErrorResponse(
                "Recovered blockchain network mismatch.",
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        if (
            submitResult.sender &&
            submitResult.sender !== payment.payerAddress
        ) {
            throw new ErrorResponse(
                "Recovered payer address mismatch.",
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        if (
            submitResult.destination &&
            submitResult.destination !== payment.receiverAddress
        ) {
            throw new ErrorResponse(
                "Recovered receiver address mismatch.",
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        const normalizeOptional = (
            value?: string | null
        ): string | undefined => {

            const trimmed = value?.trim();

            return trimmed
                ? trimmed
                : undefined;
        };

        const recoveredAsset = normalizeOptional(
            submitResult.paymentAsset
        );

        const recoveredCurrencyCode = normalizeOptional(
            submitResult.currencyCode
        );

        const recoveredIssuer = normalizeOptional(
            submitResult.issuerAddress
        );

        if (!recoveredAsset) {
            throw new ErrorResponse(
                "Recovered payment asset is unavailable.",
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        if (
            recoveredAsset.toLowerCase() !==
            payment.paymentAsset.toLowerCase()
        ) {
            throw new ErrorResponse(
                "Recovered payment asset mismatch.",
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        const recoveredAmount = normalizeOptional(
            submitResult.paymentAmount
        );

        if (!recoveredAmount) {
            throw new ErrorResponse(
                "Recovered payment amount is unavailable.",
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        if (
            DecimalUtils.compare(
                recoveredAmount,
                payment.paymentAmount
            ) !== 0
        ) {
            throw new ErrorResponse(
                "Recovered payment amount mismatch.",
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }

        const token = snapshot.tokens.find(t => {

            if (
                t.networkAlias.toLowerCase() !==
                payment.blockchainNetwork!.toLowerCase()
            ) {
                return false;
            }

            if (
                t.symbol.toLowerCase() !==
                payment.paymentAsset!.toLowerCase()
            ) {
                return false;
            }

            const snapshotCurrencyCode = normalizeOptional(
                t.currencyCode
            );

            const snapshotIssuer = normalizeOptional(
                t.issuerAddress
            );

            if (t.isNative) {
                return (
                    recoveredCurrencyCode === undefined &&
                    recoveredIssuer === undefined &&
                    snapshotCurrencyCode === undefined &&
                    snapshotIssuer === undefined
                );
            }

            if (
                !recoveredCurrencyCode ||
                !recoveredIssuer ||
                !snapshotCurrencyCode ||
                !snapshotIssuer
            ) {
                return false;
            }

            if (recoveredIssuer !== snapshotIssuer) {
                return false;
            }

            switch (submitResult.network) {

                case NetworkTypeAlias.XRPL:
                    return (
                        recoveredCurrencyCode.toUpperCase() ===
                        snapshotCurrencyCode.toUpperCase()
                    );

                default:
                    return false;
            }
        });

        if (!token) {
            throw new ErrorResponse(
                "Recovered payment asset does not match pricing snapshot.",
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
        
        return {
            Id: payment.id,
            BlockchainNetwork: payment.blockchainNetwork,
            PaymentAsset: payment.paymentAsset,
            BlockchainTxHash: payment.blockchainTxHash,
            PaymentFeeNative: submitResult.feeCharged ?? payment.paymentFeeNative,
            PaymentAmount: payment.paymentAmount,
            PayerAddress: payment.payerAddress,
            ReceiverAddress: payment.receiverAddress,
            FxRate: token.unitPrice,
            FxProvider: snapshot.provider,
            FxCapturedAt: snapshot.capturedAt,
            SettlementCurrency: payment.checkoutCurrency,
            SettlementAmount: payment.checkoutAmount
        };
    }
}

