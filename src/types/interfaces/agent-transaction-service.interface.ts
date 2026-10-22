import {
    AgentPaymentExecutionRequestDto,
    AgentPaymentExecutionResult
} from "@models/dtos/agent-transaction";

export interface IAgentTransactionService {

    createPayment(dto: AgentPaymentExecutionRequestDto): Promise<AgentPaymentExecutionResult>;
}