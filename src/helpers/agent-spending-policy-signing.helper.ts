import { HashCrossProtocol } from "@hashtrion/application/hash-protocol";
import {
    SaveAgentSpendingPolicyRequestDto
} from "@models/dtos/agent-account";

export function buildAgentSpendingPolicySigningMessage(
    dto: SaveAgentSpendingPolicyRequestDto,
    signingScope: string
): string {

    const fields = [
        HashCrossProtocol.AgentSigning.agentSpendingPolicySaveSigningPrefix,
        signingScope,
        String(dto.chainId),
        dto.publicAddress,
        String(dto.timestamp),
        dto.nonce,
        dto.policy.expiresAt,
        String(dto.policy.assets.length),
        ...dto.policy.assets.flatMap(asset => [
            asset.currencyCode,
            asset.issuer ?? "",
            asset.perTransactionLimit
        ])
    ];

    return fields
        .map(value => `${Buffer.byteLength(value, "utf8")}:${value}`)
        .join("");
}