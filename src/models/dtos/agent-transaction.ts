import { NetworkTypeAlias } from "@hashtrion/application/hash-protocol";
import { PaymentStatusReult } from "blockchains/blockchain.enum";

export interface AgentPaymentTokenDto {
    symbol: string;
    currencyCode: string | null;
    issuerAddress: string | null;
    isNative: boolean;
}
export interface AgentPaymentRequestDto {
    requestId: string;
    agentAccountId: string;
    destination: string;
    amount: string;
    token: AgentPaymentTokenDto;
    memo?: string;
    destinationTag?: number;
}

export interface AgentPaymentExecutionRequestDto {
    paymentId: string;
    agentAccountId: string;
    providerKeyReference: string;
    publicKey: string;
}

export interface AgentPaymentExecutionResult {
    requestId: string;
    agentAccountId: string;
    network: NetworkTypeAlias;
    txHash: string;
    ledgerIndex?: number;
    closeTime?: string;
    deliveredAmount?: string;
    feeCharged?: string;
    resultCode: PaymentStatusReult;
}

export interface PreparedAgentPaymentTransaction {
    network: NetworkTypeAlias;
    transaction: unknown;
}

// Signing request: chainId identifies XRPL,
// providerKeyReference identifies the versioned signing key,
// publicKey is the delegated signing public key, and
// transaction is the prepared unsigned transaction from Transaction API.
export interface SignAgentTransactionRequestDto {
    chainId: number;
    providerKeyReference: string;
    publicKey: string;
    transaction: unknown;
}
export interface SignAgentTransactionResponseDto {
    payload: string;
}


export interface AgentSigningContextDto {
    agentAccountId: string;
    chainId: number;
    publicAddress: string;
    providerKeyReference: string;
    publicKey: string;
}

