
export function normalizeXrplCurrency(currency: string): string {

    // 160-bit hex (40 hex chars)
    const isHex160 = /^[0-9A-Fa-f]{40}$/.test(currency);

    if (!isHex160) {
        return currency;
    }

    const bytes = Buffer.from(currency, "hex");

    // Strip trailing null bytes from XRPL currency codes.
    return bytes.toString("ascii").replace(/\0+$/, "");
}



