import { inject, injectable } from "inversify";
import { HttpService } from "@hashtrion/common/services/http-client.service";
import { HashCrossProtocol } from "@hashtrion/application/hash-protocol";
import { SignAgentTransactionRequestDto, SignAgentTransactionResponseDto } from "@models/dtos/agent-transaction";

@injectable()
export class SigningAPIEndpointService {

    private readonly controller = "/agent-transaction-signing";

    constructor(@inject(HttpService) private httpService: HttpService) { }

    private getInternalApiOptions() {

        const internalApiKey = process.env.INTERNAL_API_KEY;
        const baseUrlOverride = process.env.SIGNING_API_BASE_URL;

        if (!internalApiKey) throw new Error("INTERNAL_API_KEY is not configured.");
        if (!baseUrlOverride) throw new Error("SIGNING_API_BASE_URL is not configured.");

        return {
            baseUrlOverride,
            headers: {
                [HashCrossProtocol.HttpHeader.hashApiKey]: internalApiKey
            }
        };
    }

    async signAgentTransaction(dto: SignAgentTransactionRequestDto): Promise<SignAgentTransactionResponseDto> {

        return await this.httpService.post<SignAgentTransactionResponseDto>(
            `${this.controller}/sign`,
            dto,
            this.getInternalApiOptions()
        );
    }
}