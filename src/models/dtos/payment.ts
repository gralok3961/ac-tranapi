import { NetworkTypeAlias } from "@hashtrion/application/hash-protocol";
import { PaymentStatusReult } from "blockchains/blockchain.enum";

export interface PricingSnapshotTokenDto {
    networkAlias: string;
    // UI / display
    symbol: string;
    // Exact blockchain asset identity
    currencyCode: string | null;
    issuerAddress: string | null;
    unitPrice: string;
    requiredAmount: string;
    decimals: number;
    isNative: boolean;
}

export interface TokenAmount {
    token: PricingSnapshotTokenDto;
    amount: string;
}

export interface PricingSnapshotDto {
    baseCurrency: string;
    provider: string;
    capturedAt: string;
    tokens: PricingSnapshotTokenDto[];
}

export interface PaymentExecutionResult {
    network: NetworkTypeAlias;
    txHash: string;
    ledgerIndex?: number;
    closeTime?: string;
    deliveredAmount?: string;
    feeCharged?: string;
    resultCode: PaymentStatusReult;
}

export interface StandardizedSubmitResult {
    network: NetworkTypeAlias;
    txHash: string;
    ledgerIndex?: number;
    deliveredAmount?: string;
    paymentAmount?: string;
    // Display / logical symbol
    paymentAsset?: string;
    // Exact blockchain asset identity
    currencyCode?: string;
    issuerAddress?: string;
    createdAt?: string;
    sender?: string;
    destination?: string;
    feeCharged?: string;
    blockchainResultCode: string;
}

export type PaymentTransactionVerificationResult =
    | {
        status: PaymentStatusReult.SUCCESS;
        result: StandardizedSubmitResult;
    }
    | {
        status: PaymentStatusReult.FAILED;
        result: StandardizedSubmitResult;
        reason: string;
    }
    | {
        status: PaymentStatusReult.PENDING;
        reason?: string;
    };

export interface DecodedPayment {
    network: NetworkTypeAlias;
    source: string;
    destination: string;
    amount: string;
    fee: string;

    // UI / logical asset symbol
    asset: string;

    // Exact blockchain asset identity
    currencyCode?: string;

    issuer?: string;
    memo: string;
}

export interface CompletePaymentData {
    Id: string;
    BlockchainNetwork: string;
    PaymentAsset: string;
    BlockchainTxHash: string;
    PaymentFeeNative: string;   // base unit string (drops)
    PaymentAmount: string;      // decimal string
    PayerAddress: string;
    ReceiverAddress: string;
    FxRate: string;
    FxProvider: string;
    FxCapturedAt: string;
    SettlementCurrency: string;
    SettlementAmount: string;
}