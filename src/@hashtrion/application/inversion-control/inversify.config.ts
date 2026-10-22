import { PaymentExecutionContextRepository } from "@repositories/payment-excution-context.repository";
import { SQLDatabaseService } from "@hashtrion/common/services/sql-db.service";
import { Container } from "inversify";
import { XrplClient } from "blockchains/xrpl/xrpl-client";
import { CryptoPaymentRepository } from "@repositories/crypto-payment.repository";
import { BlockchainClientService } from "@services/blockchain-client.service";
import { HttpConfig, HTTPTYPES } from "@hashtrion/common/types/http-client";
import { HttpService } from "@hashtrion/common/services/http-client.service";
import { PlatformAPIEndpointService } from "@services/platform-api-endpoint.service";
import { AgentTransactionController } from "@controllers/v1/agent-transaction.controller";
import { AgentAccountController } from "@controllers/v1/agent-link.controller";
import { AgentAccountService } from "@services/agent-account.service";
import { AgentAccountExecutionValidator } from "validators/agent-account-execution-validator";
import { AgentTransactionService } from "@services/agent-transaction.service";
import { AgentTransactionExecutionValidator } from "validators/agent-transaction-execution-validator";
import { SigningAPIEndpointService } from "@services/signing-api-endpoint.service";

export const container = new Container();

container.bind<XrplClient>(XrplClient).toSelf().inSingletonScope();
container.bind<BlockchainClientService>(BlockchainClientService).toSelf().inSingletonScope();
container.bind<HttpConfig>(HTTPTYPES.HttpConfig).toConstantValue({
    baseUrl: process.env.PLATFORM_API_BASE_URL,
    timeoutMs: 6000000,
    defaultHeaders: {
        'x-service-name': 'transaction-api',
    },
});

container.bind<SQLDatabaseService>(SQLDatabaseService).toSelf().inSingletonScope();
container.bind<HttpService>(HttpService).toSelf().inSingletonScope();
container.bind<AgentAccountController>(AgentAccountController).toSelf().inRequestScope();
container.bind<AgentTransactionController>(AgentTransactionController).toSelf().inRequestScope();


container.bind<PaymentExecutionContextRepository>(PaymentExecutionContextRepository).toSelf().inRequestScope();
container.bind<CryptoPaymentRepository>(CryptoPaymentRepository).toSelf().inRequestScope();

container.bind<PlatformAPIEndpointService>(PlatformAPIEndpointService).toSelf().inSingletonScope();
container.bind<SigningAPIEndpointService>(SigningAPIEndpointService).toSelf().inSingletonScope(); 

container.bind<AgentAccountService>(AgentAccountService).toSelf().inRequestScope()
container.bind<AgentTransactionService>(AgentTransactionService).toSelf().inRequestScope()


container.bind<AgentAccountExecutionValidator>(AgentAccountExecutionValidator).toSelf().inTransientScope();
container.bind<AgentTransactionExecutionValidator>(AgentTransactionExecutionValidator).toSelf().inTransientScope();
