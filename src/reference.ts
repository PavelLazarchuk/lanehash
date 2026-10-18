const K = [0x9e3779b9, 0x7f4a7c15, 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a] as const;

const u32 = (x: number) => x >>> 0;
const mul = (x: number, y: number) => Math.imul(x, y) >>> 0;

function round([x, y]: readonly [number, number], p: number, q: number): [number, number] {
    const a = u32(x ^ p);
    const b = u32(y ^ q);
    const product = BigInt(a) * BigInt(b);
    const lo = Number(product & 0xffffffffn);
    const hi = Number(product >> 32n);
    const yNext = u32(b + hi);
    return [u32(u32(a + lo) ^ yNext), yNext];
}

function lowbias32(x: number): number {
    x = u32(x ^ (x >>> 16));
    x = mul(x, 0x7feb352d);
    x = u32(x ^ (x >>> 15));
    x = mul(x, 0x846ca68b);
    return u32(x ^ (x >>> 16));
}

function murmurFmix32(x: number): number {
    x = u32(x ^ (x >>> 16));
    x = mul(x, 0x85ebca6b);
    x = u32(x ^ (x >>> 13));
    x = mul(x, 0xc2b2ae35);
    return u32(x ^ (x >>> 16));
}

export function referenceHash(bytes: ArrayLike<number>, seed = 0n): [number, number] {
    const seedLo = Number(seed & 0xffffffffn);
    const seedHi = Number(seed >> 32n);
    const n = bytes.length;
    const byteAt = (index: number) => (index < n ? (bytes[index] as number) : 0);
    const word = (index: number) =>
        u32(
            byteAt(index) |
                (byteAt(index + 1) << 8) |
                (byteAt(index + 2) << 16) |
                (byteAt(index + 3) << 24)
        );

    let accumulator: [number, number] = [
        u32((seedLo ^ K[4]) + (n % 2 ** 32)),
        u32(seedHi ^ K[5] ^ mul(Math.floor(n / 2 ** 32), K[0])),
    ];
    let position = 0;
    if (n >= 16) {
        let lane0: [number, number] = [u32(seedLo ^ K[0]), u32(seedHi ^ K[1])];
        let lane1: [number, number] = [u32(seedLo ^ K[2]), u32(seedHi ^ K[3])];
        for (; position + 16 <= n; position += 16) {
            lane0 = round(lane0, word(position), word(position + 4));
            lane1 = round(lane1, word(position + 8), word(position + 12));
        }
        accumulator = round(accumulator, lane0[0], lane0[1]);
        accumulator = round(accumulator, lane1[0], lane1[1]);
    }
    const remaining = n - position;
    if (remaining > 0) accumulator = round(accumulator, word(position), word(position + 4));
    if (remaining > 8) accumulator = round(accumulator, word(position + 8), word(position + 12));

    const [a0, b0] = accumulator;
    let high = u32(a0 + b0);
    let low = u32(b0 + high);
    high = lowbias32(high);
    low = murmurFmix32(low);
    high = u32(high + low);
    low = u32(low + high);
    return [high, low];
}

export function utf16le(text: string): Uint8Array {
    const bytes = new Uint8Array(text.length * 2);
    for (let index = 0; index < text.length; index += 1) {
        const unit = text.charCodeAt(index);
        bytes[2 * index] = unit & 0xff;
        bytes[2 * index + 1] = unit >>> 8;
    }
    return bytes;
}
