import { AgentAccountRevocationContextInternalRequestDto, AgentAccountRevocationContextResponseDto, CompleteAgentAccountRevocationRequestDto, RevokeAgentAccountResponseDto } from "@models/dtos/agent-account";
import { IPlatformAPIEndpointService } from "@hash-types/interfaces/platform-api-endpoint-service.interface";
import { HttpService } from "@hashtrion/common/services/http-client.service";
import { HashCrossProtocol } from "@hashtrion/application/hash-protocol";
import { inject, injectable } from "inversify";
import { ActivateAgentSigningAuthorityRequestDto, ActivateAgentSigningAuthorityResponseDto, AgentAccountActivationContextResponseDto, AgentAccountChallengeDetailResponseDto, AgentAccountChallengeResponseDto, GetAgentAccountAccessStateInternalRequestDto, GetAgentAccountAccessStateResponseDto, IssueAgentAccountChallengeRequestDto, ProvisionAgentAccountAccessRequestDto, ProvisionAgentAccountAccessResponseDto, SaveAgentSpendingPolicyInternalRequestDto, SaveAgentSpendingPolicyResponseDto } from "@models/dtos/agent-account";

@injectable()
export class PlatformAPIEndpointService implements IPlatformAPIEndpointService {

    private readonly controller = "/TransactionIntegration";

    constructor(
        @inject(HttpService) private httpService: HttpService
    ) { }

    async getAgentAccountRevocationContext(dto: AgentAccountRevocationContextInternalRequestDto): Promise<AgentAccountRevocationContextResponseDto> {
        return await this.httpService.post(`${this.controller}/agent-account/revocation-context/a`, dto, this.getInternalApiOptions());
    }

    async revokeAgentAccount(dto: CompleteAgentAccountRevocationRequestDto): Promise<RevokeAgentAccountResponseDto> {
        return await this.httpService.post(`${this.controller}/agent-account/revoke/a`, dto, this.getInternalApiOptions());
    }

    private getInternalApiOptions() {

        const internalApiKey = process.env.INTERNAL_API_KEY;

        if (!internalApiKey) throw new Error("INTERNAL_API_KEY is not configured.");

        return {
            headers: {
                [HashCrossProtocol.HttpHeader.hashApiKey]: internalApiKey
            }
        };
    }

    async issueAgentAccountChallenge(dto: IssueAgentAccountChallengeRequestDto): Promise<AgentAccountChallengeResponseDto> {

        return await this.httpService.post<AgentAccountChallengeResponseDto>(
            `${this.controller}/agent-account/challenge/a`, dto, this.getInternalApiOptions()
        );
    }

    async getAgentAccountChallengeByChallengeId(challengeId: string): Promise<AgentAccountChallengeDetailResponseDto> {

        return await this.httpService.get<AgentAccountChallengeDetailResponseDto>(
            `${this.controller}/agent-account/challenge/${encodeURIComponent(challengeId)}`,
            this.getInternalApiOptions()
        );
    }

    async provisionAgentAccountAccess(dto: ProvisionAgentAccountAccessRequestDto): Promise<ProvisionAgentAccountAccessResponseDto> {

        return await this.httpService.post<ProvisionAgentAccountAccessResponseDto>(
            `${this.controller}/agent-account/provision/a`, dto, this.getInternalApiOptions()
        );
    }

    async getAgentAccountActivationContext(agentAccountId: string): Promise<AgentAccountActivationContextResponseDto> {

        return await this.httpService.get<AgentAccountActivationContextResponseDto>(
            `${this.controller}/agent-account/activation-context/${encodeURIComponent(agentAccountId)}`,
            this.getInternalApiOptions()
        );
    }

    async activateAgentSigningAuthority(dto: ActivateAgentSigningAuthorityRequestDto
    ): Promise<ActivateAgentSigningAuthorityResponseDto> {

        return await this.httpService.post<ActivateAgentSigningAuthorityResponseDto>(
            `${this.controller}/agent-account/signing-authority/activate/a`, dto,
            this.getInternalApiOptions()
        );
    }
    async getAgentAccountAccessState(dto: GetAgentAccountAccessStateInternalRequestDto): Promise<GetAgentAccountAccessStateResponseDto> {

        return await this.httpService.post<GetAgentAccountAccessStateResponseDto>(
            `${this.controller}/agent-account/access-state/a`,
            dto,
            this.getInternalApiOptions()
        );
    }

    async saveAgentSpendingPolicy(dto: SaveAgentSpendingPolicyInternalRequestDto): Promise<SaveAgentSpendingPolicyResponseDto> {

        return await this.httpService.post<SaveAgentSpendingPolicyResponseDto>(
            `${this.controller}/agent-account/spending-policy/save/a`, dto,
            this.getInternalApiOptions()
        );
    }
}