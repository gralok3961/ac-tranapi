import {
    AgentAccountChallengeDetailResponseDto,
    AgentAccountChallengeResponseDto,
    IssueAgentAccountChallengeRequestDto,
    ProvisionAgentAccountAccessRequestDto,
    ProvisionAgentAccountAccessResponseDto
} from "@models/dtos/agent-account";

export interface IPlatformAPIEndpointService {

    issueAgentAccountChallenge(dto: IssueAgentAccountChallengeRequestDto): Promise<AgentAccountChallengeResponseDto>;

    getAgentAccountChallengeByChallengeId(challengeId: string): Promise<AgentAccountChallengeDetailResponseDto>;

    provisionAgentAccountAccess( dto: ProvisionAgentAccountAccessRequestDto): Promise<ProvisionAgentAccountAccessResponseDto>;
}