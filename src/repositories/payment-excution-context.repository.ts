import { SQLDatabaseService } from "@hashtrion/common/services/sql-db.service";
import { injectable, inject } from "inversify";
import sql from "mssql";
import { AGENT_ACTIVE_SIGNING_CONTEXT_SELECT } from "queries/agent/agentSigningContext.select";
import { AgentSigningContextDto } from "@models/dtos/agent-transaction";

@injectable()
export class PaymentExecutionContextRepository {

    constructor(@inject(SQLDatabaseService) private databaseService: SQLDatabaseService) {

    }

    public async getActiveAgentSigningContext(agentAccountId: string): Promise<AgentSigningContextDto | null> {

        const db = await this.databaseService.getConnectionAsync();

        const q = AGENT_ACTIVE_SIGNING_CONTEXT_SELECT;

        const request = db.request();
        request.input("agentAccountId", sql.UniqueIdentifier, agentAccountId);

        const { recordset } = await request.query<AgentSigningContextDto>(q);

        return recordset[0] ?? null;
    }
}
