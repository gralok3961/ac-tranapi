import { VerifyChallengeSignatureParams } from "blockchains/blockchain";
import { PaymentTransactionVerificationResult, StandardizedSubmitResult } from "@models/dtos/payment";

export type XRPLNETWORK = "MAINNET" | "TESTNET";
export interface IBlockchainClient {
    decode(txData: string): unknown;

    getTransactionHash(payload: string): string;
    verifyPaymentTransactionByHash(txHash: string): Promise<PaymentTransactionVerificationResult>

    submitAndWait(payload: string): Promise<StandardizedSubmitResult>;

    verifyChallengeSignature(params: VerifyChallengeSignatureParams): Promise<boolean>;

    getAccountInfo(address: string): Promise<any>;

    isValidAddress(address: string): boolean;
}
