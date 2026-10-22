export const GET_CRYPTO_PAYMENT_BY_ID_QUERY = `
    SELECT
        Id AS id,
        PaymentCode AS paymentCode,
        PaymentSource AS paymentSource,
        CheckoutCurrency AS checkoutCurrency,
        CAST(CheckoutAmount AS VARCHAR(50)) AS checkoutAmount,
        PricingSnapshotJson AS pricingSnapshotJson,
        BlockchainNetwork AS blockchainNetwork,
        PaymentAsset AS paymentAsset,
        CAST(PaymentAmount AS VARCHAR(50)) AS paymentAmount,
        CAST(PaymentFeeNative AS VARCHAR(50)) AS paymentFeeNative,
        BlockchainTxHash AS blockchainTxHash,
        PayerAddress AS payerAddress,
        ReceiverAddress AS receiverAddress,
        Status AS status
    FROM dbo.CryptoPayments
    WHERE Id = @paymentId
`.trim();
