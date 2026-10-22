import { ICryptoPaymentRepository } from "@hash-types/interfaces/crypto-payment-repo.interface";
import { GET_CRYPTO_PAYMENT_BY_ID_QUERY } from "queries/crypto-payment/cryptoPayments.select";
import { SQLDatabaseService } from "@hashtrion/common/services/sql-db.service";
import { ErrorResponse } from "@hashtrion/common/error-response";
import { CryptoPayment } from "@models/crypto-payment";
import { injectable, inject } from "inversify";
import sql from "mssql";
import { CryptoPaymentStatus, NetworkTypeAlias } from "@hashtrion/application/hash-protocol";
import { HttpStatus } from "@hashtrion/common/types/common-variables";
import { CompletePaymentData } from "@models/dtos/payment";

@injectable()
export class CryptoPaymentRepository implements ICryptoPaymentRepository {
    constructor(@inject(SQLDatabaseService) private databaseService: SQLDatabaseService) { }

    public async getPaymentById(paymentId: string): Promise<CryptoPayment | null> {

        const db = await this.databaseService.getConnectionAsync();

        const request = db.request();

        request.input("paymentId", sql.UniqueIdentifier, paymentId);

        const result = await request.query<CryptoPayment>(
            GET_CRYPTO_PAYMENT_BY_ID_QUERY
        );

        return result.recordset[0] ?? null;
    }

    public async markPendingForSubmission(paymentId: string, network: NetworkTypeAlias, txHash: string,
        asset: string, amount: string, fee: string, payer: string, receiver: string): Promise<void> {

        const db = await this.databaseService.getConnectionAsync();
        // Send decimals as text; the driver converts Decimal parameters through JavaScript numbers.
        const result = await db.request()
            .input("paymentId", sql.UniqueIdentifier, paymentId)
            .input("network", sql.NVarChar(20), network)
            .input("txHash", sql.NVarChar(100), txHash)
            .input("asset", sql.NVarChar(20), asset)
            .input("amount", sql.NVarChar(sql.MAX), amount)
            .input("fee", sql.BigInt, BigInt(fee))
            .input("payer", sql.NVarChar(120), payer)
            .input("receiver", sql.NVarChar(120), receiver)
            .query(`
            UPDATE dbo.CryptoPayments
            SET
                Status = ${CryptoPaymentStatus.PENDING},
                BlockchainNetwork = @network,
                BlockchainTxHash = @txHash,
                PaymentAsset = @asset,
                PaymentAmount = CONVERT(decimal(28, 8), @amount),
                PaymentFeeNative = @fee,
                PayerAddress = @payer,
                ReceiverAddress = @receiver,
                DateUpdated = SYSDATETIMEOFFSET()
            WHERE Id = @paymentId
              AND Status = ${CryptoPaymentStatus.CREATED}
              AND BlockchainTxHash IS NULL
        `);

        if (result.rowsAffected[0] !== 1) {
            throw new ErrorResponse("Payment submission state transition failed.", HttpStatus.CONFLICT);
        }
    }

    public async completePayment(data: CompletePaymentData): Promise<void> {

        const db = await this.databaseService.getConnectionAsync();
        const res = await db.request()
            .input("paymentId", sql.UniqueIdentifier, data.Id)
            .input("network", sql.NVarChar(20), data.BlockchainNetwork)
            .input("asset", sql.NVarChar(20), data.PaymentAsset)
            .input("txHash", sql.NVarChar(100), data.BlockchainTxHash)
            .input("fee", sql.BigInt, BigInt(data.PaymentFeeNative))
            .input("amount", sql.NVarChar(sql.MAX), data.PaymentAmount)
            .input("payer", sql.NVarChar(120), data.PayerAddress)
            .input("receiver", sql.NVarChar(120), data.ReceiverAddress)
            .input("fxRate", sql.NVarChar(sql.MAX), data.FxRate)
            .input("fxProvider", sql.NVarChar(50), data.FxProvider)
            .input("fxCapturedAt", sql.DateTimeOffset, data.FxCapturedAt)
            .input("settlementCurrency", sql.NVarChar(3), data.SettlementCurrency)
            .input("settlementAmount", sql.NVarChar(sql.MAX), data.SettlementAmount)

            .query(`
            UPDATE dbo.CryptoPayments
            SET
                Status = ${CryptoPaymentStatus.PAID},

                BlockchainNetwork = @network,
                PaymentAsset = @asset,
                BlockchainTxHash = @txHash,

                PaymentFeeNative = @fee,
                PaymentAmount = CONVERT(decimal(28, 8), @amount),

                PayerAddress = @payer,
                ReceiverAddress = @receiver,

                FxRate = CONVERT(decimal(28, 10), @fxRate),
                FxProvider = @fxProvider,
                FxCapturedAt = @fxCapturedAt,

                SettlementCurrency = @settlementCurrency,
                SettlementAmount = CONVERT(decimal(18, 2), @settlementAmount),

                PaidAt = SYSDATETIMEOFFSET(),
                DateUpdated = SYSDATETIMEOFFSET()

            WHERE Id = @paymentId
              AND Status = ${CryptoPaymentStatus.PENDING}
              AND LOWER(BlockchainTxHash) = LOWER(@txHash)
              AND LOWER(BlockchainNetwork) = LOWER(@network)
        `);

        if (res.rowsAffected[0] !== 1) {
            throw new ErrorResponse(
                "Payment completion failed due to state mismatch.",
                HttpStatus.CONFLICT
            );
        }
    }

    public async markAsFailed(paymentId: string, reason: string): Promise<void> {
        const db = await this.databaseService.getConnectionAsync();
        const res = await db.request()
            .input("paymentId", sql.UniqueIdentifier, paymentId)
            .input("reason", sql.NVarChar(sql.MAX), reason)
            .query(`
        UPDATE dbo.CryptoPayments
        SET Status = ${CryptoPaymentStatus.FAILED},
            FailureReason = @reason,
            DateUpdated = SYSDATETIMEOFFSET()
        WHERE Id = @paymentId
          AND Status = ${CryptoPaymentStatus.PENDING}
    `);

        if (res.rowsAffected[0] !== 1) {
            throw new ErrorResponse(
                "Payment failure state transition mismatch.",
                HttpStatus.CONFLICT
            );
        }
    }
}
