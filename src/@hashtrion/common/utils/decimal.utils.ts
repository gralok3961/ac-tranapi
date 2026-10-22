import Decimal from "decimal.js";

// Keep monetary values as decimal strings to avoid floating-point loss.
export class DecimalUtils {

    static toDecimal(value: string | null | undefined): Decimal {
        if (value === null || value === undefined)
            throw new Error("Monetary value is missing.");

        if (typeof value !== "string" || !value.trim())
            throw new Error("Invalid monetary string.");

        try {
            return new Decimal(value);
        } catch {
            throw new Error("Invalid monetary format.");
        }
    }

    static compare(a: string, b: string): number {
        return this.toDecimal(a).cmp(this.toDecimal(b));
    }
}
