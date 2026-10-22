import { inject } from "inversify";
import {
    controller,
    httpPost
} from "inversify-express-utils";
import { NextFunction, Request, Response } from "express";
import { AgentTransactionService } from "@services/agent-transaction.service";
import { AgentPaymentExecutionRequestDto } from "@models/dtos/agent-transaction";
import { internalApiAuthMiddleware } from "middlewares/internal-api-auth.middleware";

@controller("/api/v1/agent-transactions")
export class AgentTransactionController {

    constructor(
        @inject(AgentTransactionService)
        private agentTransactionService: AgentTransactionService
    ) { }

    @httpPost('/payment', internalApiAuthMiddleware())
    public async createPayment(req: Request, res: Response, next: NextFunction): Promise<void> {

        try {
            const dto: AgentPaymentExecutionRequestDto = req.body;

            const result = await this.agentTransactionService.createPayment(dto);

            res.status(200).json(result);

        } catch (error) {

            next(error);
        }
    }
}