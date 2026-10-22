import { BlockChainId, NetworkTypeAlias } from "@hashtrion/application/hash-protocol";
import { AgentAccountActivationSubmitResult, DecodedAgentAccountActivationTransactionDto } from "@models/dtos/agent-account";
import { PaymentTransactionVerificationResult, StandardizedSubmitResult } from "@models/dtos/payment";
import { VerifyChallengeSignatureParams } from "blockchains/blockchain";

export interface IBlockchainClientService {

    submitAndWait(payload: string, network: NetworkTypeAlias): Promise<StandardizedSubmitResult>;

    verifyPaymentTransactionByHash(txHash: string, network: NetworkTypeAlias): Promise<PaymentTransactionVerificationResult>

    getNetworkByCahinId(chainId: BlockChainId): NetworkTypeAlias;

    isValidAddress(address: string, network: NetworkTypeAlias): boolean;

    verifyChallengeSignature(params: VerifyChallengeSignatureParams, network: NetworkTypeAlias): Promise<boolean>;

    decodeAgentAccountActivationTransaction(payload: string, chainId: number): DecodedAgentAccountActivationTransactionDto;

    submitAgentAccountActivationAndWait(payload: string, chainId: number): Promise<AgentAccountActivationSubmitResult>;

    verifyAgentSigningAuthority(chainId: number, publicAddress: string, delegatedAuthorityIdentifier: string): Promise<boolean>;

}