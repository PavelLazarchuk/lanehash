export const toBigInt = (hi: number, lo: number): bigint => (BigInt(hi) << 32n) | BigInt(lo);

export const toSafeInteger = (hi: number, lo: number): number => hi * 2_097_152 + (lo >>> 11);

export const toHex = (hi: number, lo: number): string =>
    hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
