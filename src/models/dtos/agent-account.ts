import { AgentSigningAuthorityStatus, AgentSpendingPolicyState } from "@hashtrion/application/hash-protocol";

export interface AgentAccountChallengeRequestDto {
    chainId: number;
    publicAddress: string;
}
export interface IssueAgentAccountChallengeRequestDto {
    appInstallationId: string;
    chainId: number;
    publicAddress: string;
}
export interface AgentAccountChallengeResponseDto {
    challengeId: string;
    challenge: string;
    expiresAt: string;
}

export interface ProvisionAgentAccountAccessResponseDto {
    agentAccountId: string;
    publicId: string;
    delegatedAuthorityIdentifier: string;
}

export interface AgentAccountChallengeVerifyRequestDto {
    challengeId: string;
    publicAddress: string;
    publicKey: string;
    signature: string;
}
export interface AgentAccountChallengeDetailResponseDto {
    challengeId: string;
    appInstallationId: string;
    chainId: number;
    publicAddress: string;
    challenge: string;
    purpose: number;
    status: number;
    expiresAt: string;
}
export interface ProvisionAgentAccountAccessRequestDto {
    challengeId: string;
    appInstallationId: string;
    publicKey: string;
    signature: string;
}
export interface ActivateAgentAccountRequestDto {
    agentAccountId: string;
    payload: string;
}

export interface ActivateAgentAccountResponseDto {
    agentAccountId: string;
    publicId: string;
    delegatedAuthorityIdentifier: string;
    txHash?: string;
    ledgerIndex?: number;
}

export interface AgentAccountActivationContextResponseDto {
    agentAccountId: string;
    publicId: string;
    appInstallationId: string;
    chainId: number;
    publicAddress: string;
    signingAuthorityId: string;
    delegatedAuthorityIdentifier: string;
    signingAuthorityStatus: AgentSigningAuthorityStatus;
}

export interface DecodedAgentAccountActivationTransactionDto {
    transactionType: string;
    publicAddress: string;
    delegatedAuthorityIdentifier: string;
}

export interface AgentAccountActivationSubmitResult {
    txHash: string;
    ledgerIndex?: number;
    blockchainResultCode: string;
}

export interface ActivateAgentSigningAuthorityRequestDto {
    agentAccountId: string;
    signingAuthorityId: string;
}
export interface ActivateAgentSigningAuthorityResponseDto {
    agentAccountId: string;
    publicId: string;
    signingAuthorityId: string;
    status: AgentSigningAuthorityStatus;
    activatedAt?: string;
}

export interface GetAgentAccountAccessStateRequestDto {
    chainId: number;
    publicAddress: string;
    publicKey: string;
    timestamp: number;
    signature: string;
}
export interface AgentSpendingPolicyAssetDto {
    currencyCode: string;
    issuer: string | null;
    perTransactionLimit: string;
}
export interface AgentSpendingPolicyDto {
    expiresAt: string | null;
    assets: AgentSpendingPolicyAssetDto[];
}

export interface GetAgentAccountAccessStateResponseDto {
    publicId: string;
    signingAuthorityStatus: AgentSigningAuthorityStatus | null;
    policyStatus: AgentSpendingPolicyState;
    policy: AgentSpendingPolicyDto | null;
}
export interface GetAgentAccountAccessStateInternalRequestDto {
    chainId: number;
    publicAddress: string;
    appInstallationId: string;
}

export interface SaveAgentSpendingPolicyAssetDto {
    currencyCode: string;
    issuer: string | null;
    perTransactionLimit: string;
}

export interface SaveAgentSpendingPolicyDto {
    expiresAt: string;
    assets: SaveAgentSpendingPolicyAssetDto[];
}

export interface SaveAgentSpendingPolicyRequestDto {
    chainId: number;
    publicAddress: string;
    publicKey: string;
    timestamp: number;
    nonce: string;
    signature: string;
    policy: SaveAgentSpendingPolicyDto;
}

export type SaveAgentSpendingPolicyResponseDto =
    GetAgentAccountAccessStateResponseDto;

export interface SaveAgentSpendingPolicyInternalRequestDto {
    appInstallationId: string;
    chainId: number;
    publicAddress: string;
    timestamp: number;
    nonce: string;
    policy: SaveAgentSpendingPolicyDto;
}
