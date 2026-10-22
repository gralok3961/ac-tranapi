import { VerifyChallengeSignatureParams } from "blockchains/blockchain";
import { AgentAccountActivationSubmitResult, DecodedAgentAccountActivationTransactionDto } from "@models/dtos/agent-account";
import { DecodedPayment, PaymentTransactionVerificationResult, StandardizedSubmitResult } from "@models/dtos/payment";
import { BlockChainId, NativeToken, NetworkTypeAlias } from "@hashtrion/application/hash-protocol";
import { IBlockchainClient } from "@hash-types/interfaces/blockchain-client.interface";
import { IBlockchainClientService } from "interfaces/BlockchainClientService";
import { HttpStatus } from "@hashtrion/common/types/common-variables";
import { normalizeXrplCurrency } from "blockchains/blockchain.utils";
import { ErrorResponse } from "@hashtrion/common/error-response";
import { XrplClient } from "blockchains/xrpl/xrpl-client";
import { inject, injectable } from "inversify";
import { AgentPaymentRequestDto, PreparedAgentPaymentTransaction } from "@models/dtos/agent-transaction";
import { Payment, xrpToDrops } from "xrpl";

@injectable()
export class BlockchainClientService implements IBlockchainClientService {
    constructor(
        @inject(XrplClient) private xrpl: XrplClient
    ) { }

    public isValidAddress(
        address: string,
        network: NetworkTypeAlias
    ): boolean {
        const client = this.getClient(network);

        return client.isValidAddress(address);
    }

    getClient(network: NetworkTypeAlias): IBlockchainClient {
        switch (network) {
            case NetworkTypeAlias.XRPL:
                return this.xrpl;
            default:
                throw new ErrorResponse(`Network ${network} is not supported.`, HttpStatus.BAD_REQUEST);
        }
    }

    getNetworkByCahinId(chainId: BlockChainId): NetworkTypeAlias {
        switch (chainId) {
            case BlockChainId.XRPL:
                return NetworkTypeAlias.XRPL;
            default:
                throw new ErrorResponse('Unsupported chainId.', HttpStatus.BAD_REQUEST);
        }
    }

    decodePayload(payload: string, network: NetworkTypeAlias): DecodedPayment {

        if (!payload || !payload.trim()) {
            throw new ErrorResponse("Payment payload is missing.", HttpStatus.UNPROCESSABLE_ENTITY);
        }
        const client = this.getClient(network);
        const raw = client.decode(payload);
        if (client instanceof XrplClient) {
            return this.mapXrplToStandard(raw);
        }

        throw new ErrorResponse("Unsupported blockchain client", HttpStatus.BAD_REQUEST);
    }
    private mapXrplToStandard(tx: any): DecodedPayment {

        if (tx.TransactionType !== "Payment") {
            throw new ErrorResponse("Only Payment transactions are supported", HttpStatus.BAD_REQUEST);
        }

        const TF_PARTIAL_PAYMENT = 0x00020000;

        if ((Number(tx.Flags ?? 0) & TF_PARTIAL_PAYMENT) !== 0) {
            throw new ErrorResponse(
                "XRPL partial payments are not supported for HashPay.",
                HttpStatus.BAD_REQUEST
            );
        }

        let amount: string;
        let asset: string;
        let currencyCode: string | undefined;
        let issuer: string | undefined;

        if (typeof tx.Amount === "string") {
            amount = tx.Amount;
            asset = NativeToken.XRP;
            currencyCode = undefined;
            issuer = undefined;
        } else {
            amount = tx.Amount.value;
            // Display / logical symbol
            asset = normalizeXrplCurrency(tx.Amount.currency);
            // Exact on-chain asset identity
            currencyCode = String(tx.Amount.currency);
            issuer = tx.Amount.issuer;
        }

        const memo = this.extractMemo(tx, NetworkTypeAlias.XRPL);

        return {
            network: NetworkTypeAlias.XRPL,
            source: tx.Account,
            destination: tx.Destination,
            amount,
            fee: tx.Fee,
            asset,
            currencyCode,
            issuer,
            memo
        };
    }

    private extractMemo(tx: any, network: NetworkTypeAlias): string {

        switch (network) {

            case NetworkTypeAlias.XRPL: {

                if (!tx.Memos || tx.Memos.length === 0) return "";

                const memoHex = tx.Memos[0]?.Memo?.MemoData;

                if (!memoHex) return "";

                try {
                    return Buffer.from(memoHex, "hex").toString("utf8");
                } catch {
                    throw new ErrorResponse(
                        "Invalid XRPL memo encoding.", HttpStatus.UNPROCESSABLE_ENTITY
                    );
                }
            }

            default:
                return "";
        }
    }

    public getTransactionHash(payload: string, network: NetworkTypeAlias): string {

        const client = this.getClient(network);

        return client.getTransactionHash(payload);
    }
    public async verifyPaymentTransactionByHash(txHash: string, network: NetworkTypeAlias): Promise<PaymentTransactionVerificationResult> {

        const client = this.getClient(network);

        return await client.verifyPaymentTransactionByHash(txHash);
    }

    public async submitAndWait(payload: string, network: NetworkTypeAlias): Promise<StandardizedSubmitResult> {

        const client = this.getClient(network);

        return client.submitAndWait(payload);
    }

    async verifyChallengeSignature(params: VerifyChallengeSignatureParams, network: NetworkTypeAlias): Promise<boolean> {

        const client = this.getClient(network);

        return await client.verifyChallengeSignature(params);
    }

    public async verifyAgentSigningAuthority(chainId: number, publicAddress: string, delegatedAuthorityIdentifier: string
    ): Promise<boolean> {

        const network = this.getNetworkByCahinId(chainId as BlockChainId);

        const client = this.getClient(network);

        switch (network) {

            case NetworkTypeAlias.XRPL: {

                const accountInfo = await client.getAccountInfo(publicAddress);

                const regularKey = accountInfo?.result?.account_data?.RegularKey;

                if (typeof regularKey !== "string") {
                    return false;
                }

                return regularKey.trim() === delegatedAuthorityIdentifier.trim();
            }

            default:
                throw new ErrorResponse(
                    "Unsupported blockchain network.", HttpStatus.BAD_REQUEST
                );
        }
    }

    public decodeAgentAccountActivationTransaction(payload: string, chainId: number): DecodedAgentAccountActivationTransactionDto {

        if (!payload || !payload.trim()) {
            throw new ErrorResponse(
                "Agent activation payload is required.", HttpStatus.BAD_REQUEST
            );
        }

        const network = this.getNetworkByCahinId(chainId as BlockChainId);

        const client = this.getClient(network);

        switch (network) {

            case NetworkTypeAlias.XRPL: {
                const decoded = client.decode(payload.trim()) as any;

                const transactionType = typeof decoded?.TransactionType === "string" ? decoded.TransactionType.trim() : "";

                const publicAddress = typeof decoded?.Account === "string" ? decoded.Account.trim() : "";

                const delegatedAuthorityIdentifier = typeof decoded?.RegularKey === "string" ? decoded.RegularKey.trim() : "";

                if (!transactionType || !publicAddress || !delegatedAuthorityIdentifier) {
                    throw new ErrorResponse(
                        "Invalid Agent Account activation transaction.", HttpStatus.BAD_REQUEST
                    );
                }
                return {
                    transactionType,
                    publicAddress,
                    delegatedAuthorityIdentifier
                };
            }

            default:
                throw new ErrorResponse(
                    "Unsupported blockchain network.", HttpStatus.BAD_REQUEST
                );
        }
    }

    public async submitAgentAccountActivationAndWait(payload: string, chainId: number
    ): Promise<AgentAccountActivationSubmitResult> {

        const network = this.getNetworkByCahinId(chainId as BlockChainId);

        const client = this.getClient(network);

        if (client instanceof XrplClient) {
            return await client.submitAgentAccountActivationAndWait(payload);
        }

        throw new ErrorResponse(
            "Unsupported blockchain client.", HttpStatus.BAD_REQUEST
        );
    }

    public async prepareAgentPaymentTransaction(dto: AgentPaymentRequestDto, sourceAddress: string, network: NetworkTypeAlias): Promise<PreparedAgentPaymentTransaction> {

        switch (network) {

            case NetworkTypeAlias.XRPL:
                return {
                    network,
                    transaction: await this.prepareXrplAgentPaymentTransaction(dto, sourceAddress)
                };

            default:
                throw new ErrorResponse("Unsupported blockchain network.", HttpStatus.BAD_REQUEST);
        }
    }

    private async prepareXrplAgentPaymentTransaction(dto: AgentPaymentRequestDto, sourceAddress: string): Promise<Payment> {

        const amount = dto.token.isNative ? xrpToDrops(dto.amount)
            : {
                currency: dto.token.currencyCode!,
                issuer: dto.token.issuerAddress!,
                value: dto.amount
            };

        const transaction: Payment = {
            TransactionType: "Payment",
            Account: sourceAddress,
            Destination: dto.destination,
            Amount: amount
        };

        if (dto.destinationTag !== undefined) {
            transaction.DestinationTag = dto.destinationTag;
        }

        if (dto.memo) {
            transaction.Memos = [{
                Memo: {
                    MemoData: Buffer.from(dto.memo, "utf8").toString("hex").toUpperCase()
                }
            }];
        }

        return await this.xrpl.autofill(transaction);
    }
}

