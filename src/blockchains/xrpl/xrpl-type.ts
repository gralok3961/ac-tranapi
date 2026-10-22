import type { SubmittableTransaction } from "xrpl";

export type XRPLTransactionType =
    SubmittableTransaction["TransactionType"];

export const XRPLTransactionTypes = {
    SetRegularKey: "SetRegularKey"
} as const satisfies Record<string, XRPLTransactionType>;