import { NetworkTypeAlias } from "@hashtrion/application/hash-protocol";
import { CryptoPayment } from "@models/crypto-payment";

export interface ICryptoPaymentRepository {

    getPaymentById(paymentId: string): Promise<CryptoPayment | null>;

    markPendingForSubmission(
        paymentId: string,
        network: NetworkTypeAlias,
        txHash: string,
        asset: string,
        amount: string,
        fee: string,
        payer: string,
        receiver: string
    ): Promise<void>;
}
