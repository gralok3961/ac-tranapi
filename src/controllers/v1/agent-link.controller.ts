import {
    ActivateAgentAccountRequestDto,
    ActivateAgentAccountResponseDto,
    AgentAccountChallengeRequestDto,
    AgentAccountChallengeVerifyRequestDto,
    GetAgentAccountAccessStateRequestDto,
    GetAgentAccountAccessStateResponseDto,
    ProvisionAgentAccountAccessResponseDto,
    SaveAgentSpendingPolicyRequestDto,
    SaveAgentSpendingPolicyResponseDto
} from "@models/dtos/agent-account";
import {
    AppClientAuthContext,
    appClientAuthMiddleware
} from "middlewares/app-client-auth.middleware";
import { AgentAccountService } from "@services/agent-account.service";
import { TypedRequest } from "@hashtrion/common/model/typed-request";
import { controller, httpPost } from "inversify-express-utils";
import { Response } from "express";
import { inject } from "inversify";

@controller('/api/v1/agent-account')
export class AgentAccountController {

    constructor(
        @inject(AgentAccountService)
        private agentAccountService: AgentAccountService
    ) { }

    @httpPost('/challenge/a', appClientAuthMiddleware())
    public async issueAgentAccountChallenge(req: TypedRequest<AgentAccountChallengeRequestDto>, res: Response) {
        const appClient = (req as typeof req & {
            appClient: AppClientAuthContext;
        }).appClient;

        const challenge = await this.agentAccountService.issueAgentAccountChallenge(
            req.body,
            appClient.appInstallationId
        );

        return res.json(challenge);
    }
    @httpPost('/provision/a', appClientAuthMiddleware())
    public async provisionAgentAccountAccess(req: TypedRequest<AgentAccountChallengeVerifyRequestDto>, res: Response) {
        const appClient = (req as typeof req & {
            appClient: AppClientAuthContext;
        }).appClient;

        const result: ProvisionAgentAccountAccessResponseDto =
            await this.agentAccountService.provisionAgentAccountAccess(req.body, appClient.appInstallationId);

        return res.json(result);
    }

    @httpPost('/activate/a', appClientAuthMiddleware())
    public async activateAgentAccount(req: TypedRequest<ActivateAgentAccountRequestDto>, res: Response) {
        const appClient = (req as typeof req & {
            appClient: AppClientAuthContext;
        }).appClient;

        const result: ActivateAgentAccountResponseDto =
            await this.agentAccountService.activateAgentAccount(
                req.body,
                appClient.appInstallationId
            );

        return res.json(result);
    }

    @httpPost('/access-state/a', appClientAuthMiddleware())
    public async getAgentAccountAccessState(req: TypedRequest<GetAgentAccountAccessStateRequestDto>, res: Response) {
        const appClient = (req as typeof req & {
            appClient: AppClientAuthContext;
        }).appClient;

        const result: GetAgentAccountAccessStateResponseDto =
            await this.agentAccountService.getAgentAccountAccessState(req.body, appClient.appInstallationId);

        return res.json(result);
    }

    @httpPost('/spending-policy/save/a', appClientAuthMiddleware())
    public async saveAgentSpendingPolicy(req: TypedRequest<SaveAgentSpendingPolicyRequestDto>, res: Response) {
        const appClient = (req as typeof req & {
            appClient: AppClientAuthContext;
        }).appClient;

        const result: SaveAgentSpendingPolicyResponseDto =
            await this.agentAccountService.saveAgentSpendingPolicy(req.body, appClient.appInstallationId);

        return res.json(result);
    }
}