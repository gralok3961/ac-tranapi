import { PaymentTransactionVerificationResult, StandardizedSubmitResult } from "@models/dtos/payment";
import { IBlockchainClient, XRPLNETWORK } from "@hash-types/interfaces/blockchain-client.interface";
import { NativeToken, NetworkTypeAlias } from "@hashtrion/application/hash-protocol";
import { normalizeXrplCurrency } from "blockchains/blockchain.utils";
import { VerifyChallengeSignatureParams } from "../blockchain";
import { Client, decode, hashes, Payment, dropsToXrp, isValidClassicAddress, SubmittableTransaction } from "xrpl";
import * as rippleKeypairs from 'ripple-keypairs';
import { injectable } from "inversify";
import { PaymentStatusReult } from "blockchains/blockchain.enum";
import { AgentAccountActivationSubmitResult } from "@models/dtos/agent-account";
@injectable()
export class XrplClient implements IBlockchainClient {
    private readonly client: Client;
    private reconnecting = false;

    public readonly network: XRPLNETWORK = (process.env.XRPL_NETWORK as XRPLNETWORK) ?? "MAINNET";

    public readonly endpoint: string = process.env.XRPL_ENDPOINT!;

    constructor() {

        if (!this.endpoint) throw new Error("XRPL_ENDPOINT is not defined");
        this.client = new Client(this.endpoint, {
            connectionTimeout: 10000
        });

        this.handleEvents();
    }
    getTransactionHash(payload: string): string {

        return hashes.hashSignedTx(payload.trim());
    }

    logInitialization(): void {
        console.log(`[XRPL:${this.network}] Connected to ${this.endpoint}`);
    }
    private handleEvents() {
        this.client.on("disconnected", async (code) => {
            if (this.reconnecting) return;

            this.reconnecting = true;
            console.log(`[XRPL:${this.network}] Disconnected (Code: ${code}). Retrying in 3s...`);

            setTimeout(async () => {
                try {
                    await this.connect();
                } catch (err) {
                    console.error(`[XRPL:${this.network}] Reconnection failed:`, err);
                } finally {
                    this.reconnecting = false;
                }
            }, 3000);
        });

        this.client.on("error", (errorCode, errorMessage) => {
            console.error(`[XRPL:${this.network}] Client Error: ${errorCode} - ${errorMessage}`);
        });
    }

    async connect(): Promise<void> {
        if (!this.client.isConnected()) {
            try {
                await this.client.connect();
                this.logInitialization()
            } catch (err) {
                console.error(`[XRPL:${this.network}] Initial connection error:`, err);
                throw err;
            }
        }
    }

    get instance(): Client { return this.client; }

    public decode(txBlob: string): unknown {
        try {
            return decode(txBlob);
        } catch {
            throw new Error("Invalid XRPL transaction payload");
        }
    }

    public async ensureConnected(): Promise<void> {
        if (this.client.isConnected()) return;

        await this.client.connect();
        console.log(`[XRPL:${this.network}] Reconnected automatically`);
    }

    public async submitAndWait(txBlob: string): Promise<StandardizedSubmitResult> {

        await this.ensureConnected();

        const response = await this.client.submitAndWait(txBlob);
        const result = response.result;
        const meta = result.meta as any;

        if (result.validated !== true || !meta?.TransactionResult) {
            throw new Error(
                "XRPL transaction finality could not be confirmed."
            );
        }

        const txJson = result.tx_json as Payment;
        const transactionResult: string = meta.TransactionResult;

        let deliveredAmount: string | undefined;

        if (meta?.delivered_amount) {
            if (typeof meta.delivered_amount === "string") {
                deliveredAmount = meta.delivered_amount;
            } else if (typeof meta.delivered_amount === "object" && "value" in meta.delivered_amount) {
                deliveredAmount = meta.delivered_amount.value;
            }
        }

        return {
            network: NetworkTypeAlias.XRPL,
            txHash: result.hash,
            ledgerIndex: result.ledger_index,
            deliveredAmount,
            createdAt: result.close_time_iso ?? new Date().toISOString(),
            sender: txJson.Account,
            destination: txJson.Destination,
            feeCharged: txJson.Fee,
            blockchainResultCode: transactionResult
        };
    }

    public async verifyPaymentTransactionByHash(txHash: string): Promise<PaymentTransactionVerificationResult> {

        await this.ensureConnected();

        try {
            const response = await this.client.request({
                command: "tx",
                transaction: txHash,
                binary: false
            } as any);

            const result = response.result as any;

            if (result.validated !== true) {
                return {
                    status: PaymentStatusReult.PENDING,
                    reason: "Transaction is not validated yet."
                };
            }

            const txJson = (result.tx_json ?? result) as Payment;
            const meta = result.meta as any;
            const transactionResult = String(meta?.TransactionResult ?? "");

            if (!transactionResult) {
                return {
                    status: PaymentStatusReult.PENDING,
                    reason: "Validated transaction result is unavailable."
                };
            }

            let deliveredAmount: string | undefined;
            let paymentAmount: string | undefined;
            let paymentAsset: string | undefined;
            let currencyCode: string | undefined;
            let issuerAddress: string | undefined;

            if (meta?.delivered_amount) {

                if (typeof meta.delivered_amount === "string") {
                    deliveredAmount = meta.delivered_amount;
                    paymentAmount = String(
                        dropsToXrp(meta.delivered_amount)
                    );
                    paymentAsset = NativeToken.XRP;
                    currencyCode = undefined;
                    issuerAddress = undefined;
                } else if (
                    typeof meta.delivered_amount === "object" &&
                    "value" in meta.delivered_amount
                ) {
                    deliveredAmount = meta.delivered_amount.value;
                    paymentAmount = meta.delivered_amount.value;
                    paymentAsset = normalizeXrplCurrency(
                        meta.delivered_amount.currency
                    );
                    currencyCode = String(meta.delivered_amount.currency);
                    issuerAddress = meta.delivered_amount.issuer;
                }
            }
            const standardizedResult: StandardizedSubmitResult = {
                network: NetworkTypeAlias.XRPL,
                txHash: result.hash ?? txHash,
                ledgerIndex: result.ledger_index,
                deliveredAmount,
                paymentAmount,
                paymentAsset,
                currencyCode,
                issuerAddress,
                createdAt: result.close_time_iso,
                sender: txJson.Account,
                destination: txJson.Destination,
                feeCharged: txJson.Fee,
                blockchainResultCode: transactionResult
            };

            if (transactionResult === "tesSUCCESS") {
                return {
                    status: PaymentStatusReult.SUCCESS,
                    result: standardizedResult
                };
            }

            return {
                status: PaymentStatusReult.FAILED,
                result: standardizedResult,
                reason: `XRPL transaction failed: ${transactionResult}`
            };

        } catch (error: any) {

            if (error?.data?.error === "txnNotFound") {
                return {
                    status: PaymentStatusReult.PENDING,
                    reason: "Transaction is not currently available on XRPL."
                };
            }

            throw error;
        }
    }

    public async verifyChallengeSignature(params: VerifyChallengeSignatureParams): Promise<boolean> {
        const challenge = params.challenge?.trim();
        const address = params.address?.trim();
        const publicKey = params.publicKey?.trim();
        const signature = params.signature?.trim();

        if (!challenge || !address || !publicKey || !signature) {
            return false;
        }

        const messageHex = Buffer.from(challenge, 'utf8').toString('hex').toUpperCase();

        const signatureValid = rippleKeypairs.verify(messageHex, signature, publicKey);

        if (!signatureValid) {
            return false;
        }

        const derivedAddress = rippleKeypairs.deriveAddress(publicKey);

        return derivedAddress === address;
    }

    public async getAccountInfo(address: string): Promise<any> {

        await this.ensureConnected();

        return await this.client.request({
            command: "account_info",
            account: address,
            ledger_index: "validated"
        });
    }

    public isValidAddress(address: string): boolean {
        const cleanedAddress = address?.trim();

        if (!cleanedAddress) {
            return false;
        }

        return isValidClassicAddress(cleanedAddress);
    }

    public async submitAgentAccountActivationAndWait(txBlob: string):
        Promise<AgentAccountActivationSubmitResult> {

        await this.ensureConnected();

        const response = await this.client.submitAndWait(txBlob);

        const result = response.result;
        const meta = result.meta as any;

        const blockchainResultCode =
            String(meta?.TransactionResult ?? "");

        if (!blockchainResultCode) {
            throw new Error(
                "XRPL Agent Account activation result is unavailable."
            );
        }

        return {
            txHash: result.hash,
            ledgerIndex: result.ledger_index,
            blockchainResultCode
        };
    }

    public async autofill<T extends SubmittableTransaction>(transaction: T): Promise<T> {

        await this.ensureConnected();

        return await this.client.autofill(transaction);
    }
}