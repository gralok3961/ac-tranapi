export const HashCrossProtocol = {
    HttpHeader: {
        hashApiKey: "x-hashtrion-internal-key"
    },
    HashAppClientType: {
        WALLET: "wallet"
    },
    AgentSigning: {
        agentSpendingPolicySaveSigningPrefix: "HASHTRION_AGENT_SPENDING_POLICY_SAVE_V1"
    },
} as const;

export enum CryptoPaymentStatus {
    CREATED = 0,
    PENDING = 1,
    PAID = 2,
    FAILED = 3,
}

export enum CryptoPaymentSource {
    AGENT = "AGENT",
}
export enum NetworkTypeAlias {
    XRPL = 'xrpl',
}
export enum NativeToken {
    XRP = 'XRP',
}
export enum BlockChainId {
    XRPL = 1,
}
export type NetworkFeePolicy = {
    min: string;
    max: string;
};
export const FeePolicy: Record<NetworkTypeAlias, NetworkFeePolicy> = {
    [NetworkTypeAlias.XRPL]: {
        min: "10",      // 10 drops
        max: "5000"     // safety ceiling
    },
};

export enum AgentAccountChallengePurpose {
    RegisterAgentAccount = 1,
}

export enum AgentSigningAuthorityStatus {
    Provisioned = 1,
    Active = 2,
    Revoked = 3
}

export enum AgentSpendingPolicyState {
    NotConfigured = "NotConfigured",
    Configured = "Configured",
    Expired = "Expired"
}

