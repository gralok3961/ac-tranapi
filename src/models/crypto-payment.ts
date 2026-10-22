export interface CryptoPayment {

    id: string;

    paymentCode: string;
    paymentSource: string | null;

    checkoutCurrency: string;
    checkoutAmount: string;

    pricingSnapshotJson: string | null;

    blockchainNetwork: string | null;
    paymentAsset: string | null;
    paymentAmount: string | null;
    paymentFeeNative: string | null;
    blockchainTxHash: string | null;
    payerAddress: string | null;
    receiverAddress: string | null;

    status: number;
}
