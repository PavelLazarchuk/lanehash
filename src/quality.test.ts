import { describe, expect, it } from 'vitest';
import { hash53, hashParts } from './index';
import { random, randomSeed } from './testing';

const noiseBound = (samples: number, pairs: number) =>
    1.5 * (0.5 / Math.sqrt(samples)) * Math.sqrt(2 * Math.log(2 * pairs));

function avalanche(length: number, samples: number, seed = 0, exhaustive = false): number {
    const next = random(length * 977 + seed);
    const flips = new Float64Array(length * 8 * 64);
    const key = new Uint8Array(length);
    for (let sample = 0; sample < samples; sample += 1) {
        for (let k = 0; k < length; k += 1) {
            key[k] = exhaustive ? (sample >>> (8 * k)) & 0xff : next() & 0xff;
        }
        const [high, low] = hashParts(key, seed);
        for (let bit = 0; bit < length * 8; bit += 1) {
            key[bit >> 3]! ^= 1 << (bit & 7);
            const [flippedHigh, flippedLow] = hashParts(key, seed);
            key[bit >> 3]! ^= 1 << (bit & 7);
            const dl = (flippedLow ^ low) >>> 0;
            const dh = (flippedHigh ^ high) >>> 0;
            const base = bit * 64;
            for (let out = 0; out < 32; out += 1) {
                flips[base + out]! += (dl >>> out) & 1;
                flips[base + 32 + out]! += (dh >>> out) & 1;
            }
        }
    }
    let worst = 0;
    for (const count of flips) worst = Math.max(worst, Math.abs(count / samples - 0.5));
    return worst;
}

function collisions(keys: Iterable<string | Uint8Array>) {
    const full = new Set<string>();
    const lows = new Set<number>();
    const highs = new Set<number>();
    let n = 0;
    const counts = { full: 0, low: 0, high: 0 };
    for (const key of keys) {
        n += 1;
        const [high, low] = hashParts(key);
        const both = `${high}:${low}`;
        if (full.has(both)) counts.full += 1;
        full.add(both);
        if (lows.has(low)) counts.low += 1;
        lows.add(low);
        if (highs.has(high)) counts.high += 1;
        highs.add(high);
    }
    const expected32 = (n * (n - 1)) / 2 / 2 ** 32;
    return { ...counts, expected32, limit32: expected32 + 6 * Math.sqrt(expected32) + 6 };
}

function* decimals(count: number) {
    for (let i = 0; i < count; i += 1) yield String(i);
}

function* sparseKeys(length: number) {
    yield new Uint8Array(length);
    for (let i = 0; i < length * 8; i += 1) {
        const one = new Uint8Array(length);
        one[i >> 3] = 1 << (i & 7);
        yield one;
        for (let j = i + 1; j < length * 8; j += 1) {
            const two = one.slice();
            two[j >> 3]! |= 1 << (j & 7);
            yield two;
        }
    }
}

describe('avalanche: every input bit flips every output bit half the time', () => {
    it('for every 1-byte and every 2-byte input, exhaustively', () => {
        expect(avalanche(1, 256, 0, true)).toBeLessThan(0.18);
        expect(avalanche(2, 65_536, 0, true)).toBeLessThan(noiseBound(65_536, 16 * 64));
    });

    it.each([3, 4, 7, 8, 12, 16, 17, 31, 32, 64])('for random %d-byte inputs', length => {
        const samples = length > 32 ? 1500 : 4000;
        expect(avalanche(length, samples)).toBeLessThan(noiseBound(samples, length * 8 * 64));
    });

    it.each([8, 13, 16, 33])('for random strings of %d UTF-16 code units', length => {
        const next = random(length * 31);
        const samples = 2500;
        const flips = new Float64Array(length * 16 * 64);
        const units = new Array<number>(length);
        const text = () => String.fromCharCode(...units);
        for (let sample = 0; sample < samples; sample += 1) {
            for (let k = 0; k < length; k += 1) units[k] = next() & 0xffff;
            const [high, low] = hashParts(text());
            for (let bit = 0; bit < length * 16; bit += 1) {
                units[bit >> 4]! ^= 1 << (bit & 15);
                const [h, l] = hashParts(text());
                units[bit >> 4]! ^= 1 << (bit & 15);
                const dl = (l ^ low) >>> 0;
                const dh = (h ^ high) >>> 0;
                for (let out = 0; out < 32; out += 1) {
                    flips[bit * 64 + out]! += (dl >>> out) & 1;
                    flips[bit * 64 + 32 + out]! += (dh >>> out) & 1;
                }
            }
        }
        let worst = 0;
        for (const count of flips) worst = Math.max(worst, Math.abs(count / samples - 0.5));
        expect(worst).toBeLessThan(noiseBound(samples, length * 16 * 64));
    });

    it('for random 256-byte inputs', () => {
        expect(avalanche(256, 300)).toBeLessThan(noiseBound(300, 256 * 8 * 64));
    });

    it('with a non-zero seed', () => {
        expect(avalanche(16, 3000, 0x5eed)).toBeLessThan(noiseBound(3000, 128 * 64));
    });

    it('for every bit of a 64-bit seed', () => {
        const next = random(7);
        const samples = 4000;
        const flips = new Float64Array(64 * 64);
        for (let sample = 0; sample < samples; sample += 1) {
            const key = String(next());
            const seed = randomSeed(next);
            const [high, low] = hashParts(key, seed);
            for (let bit = 0n; bit < 64n; bit += 1n) {
                const [h, l] = hashParts(key, seed ^ (1n << bit));
                const dl = (l ^ low) >>> 0;
                const dh = (h ^ high) >>> 0;
                for (let out = 0; out < 32; out += 1) {
                    flips[Number(bit) * 64 + out]! += (dl >>> out) & 1;
                    flips[Number(bit) * 64 + 32 + out]! += (dh >>> out) & 1;
                }
            }
        }
        const worst = Math.max(...Array.from(flips, count => Math.abs(count / samples - 0.5)));
        expect(worst).toBeLessThan(noiseBound(samples, 64 * 64));
    });
});

describe('collisions match a random 64-bit function', () => {
    it('on 262,144 sequential decimal strings', () => {
        const result = collisions(decimals(1 << 18));
        expect(result.full).toBe(0);
        expect(result.low).toBeLessThan(result.limit32);
        expect(result.high).toBeLessThan(result.limit32);
    });

    it('on every key with at most two bits set (8, 16 and 32 bytes)', () => {
        for (const length of [8, 16, 32]) {
            const result = collisions(sparseKeys(length));
            expect(result.full).toBe(0);
            expect(result.low).toBeLessThan(result.limit32);
        }
    });

    it('on all-zero inputs of every length up to 4 KiB, and strings of one repeated character', () => {
        const zeros = Array.from({ length: 4097 }, (_, length) => new Uint8Array(length));
        expect(collisions(zeros).full).toBe(0);
        const repeats = Array.from({ length: 4097 }, (_, length) => 'a'.repeat(length));
        expect(collisions(repeats).full).toBe(0);
    });

    it('on every ordering of the same blocks (the permutation test)', () => {
        const blocks = [0, 1, 2, 3, 4, 5, 6, 7].map(i => [i * 0x11, 0x80, 0, 0xff - i]);
        const permutations: number[][] = [];
        const permute = (rest: number[], prefix: number[]) => {
            if (rest.length === 0) permutations.push(prefix);
            rest.forEach((value, index) =>
                permute([...rest.slice(0, index), ...rest.slice(index + 1)], [...prefix, value])
            );
        };
        permute([0, 1, 2, 3, 4, 5, 6, 7], []);
        const asBytes = permutations.map(order => Uint8Array.from(order.flatMap(i => blocks[i]!)));
        const asStrings = permutations.map(order =>
            order.map(i => String.fromCharCode(0x100 + i * 3, 0x4e00 + i)).join('')
        );
        for (const keys of [asBytes, asStrings]) {
            const result = collisions(keys);
            expect(result.full).toBe(0);
            expect(result.low).toBeLessThan(result.limit32);
            expect(result.high).toBeLessThan(result.limit32);
        }
    });

    it('when only the words of one lane vary, across stripes', () => {
        const next = random(99);
        for (const [first, second] of [
            [0, 16],
            [4, 20],
            [8, 24],
            [12, 28],
        ] as const) {
            const keys = Array.from({ length: 200_000 }, () => {
                const key = new Uint8Array(32);
                const view = new DataView(key.buffer);
                view.setUint32(first, next(), true);
                view.setUint32(second, next(), true);
                return key;
            });
            const result = collisions(keys);
            expect(result.full, `bytes ${first} and ${second}`).toBe(0);
            expect(result.low).toBeLessThan(result.limit32);
        }
        const strings = Array.from({ length: 200_000 }, () => {
            const units = new Array<number>(16).fill(0x61);
            units[0] = next() & 0xffff;
            units[1] = next() & 0xffff;
            units[8] = next() & 0xffff;
            units[9] = next() & 0xffff;
            return String.fromCharCode(...units);
        });
        expect(collisions(strings).full).toBe(0);
    });

    it('on the pair a first review found colliding under every seed', () => {
        const x = new Uint8Array(32);
        const y = new Uint8Array(32);
        new DataView(y.buffer).setUint32(0, 0x4936d0b9, true);
        new DataView(y.buffer).setUint32(16, 0x67e2e000, true);
        const next = random(5);
        let same = 0;
        for (let run = 0; run < 2000; run += 1) {
            const seed = randomSeed(next);
            if (hashParts(x, seed).join() === hashParts(y, seed).join()) same += 1;
        }
        expect(same).toBe(0);
    });

    it('on same-lane word differences one stripe apart, under random seeds', () => {
        const next = random(6);
        let same = 0;
        for (let run = 0; run < 20_000; run += 1) {
            const x = new Uint8Array(32).map(() => next() & 0xff);
            const y = x.slice();
            const lane = (next() % 4) * 4;
            const view = new DataView(y.buffer);
            view.setUint32(lane, view.getUint32(lane, true) ^ (next() | 1), true);
            view.setUint32(lane + 16, view.getUint32(lane + 16, true) ^ next(), true);
            const seed = randomSeed(next);
            if (hashParts(x, seed).join() === hashParts(y, seed).join()) same += 1;
        }
        expect(same).toBe(0);
    });

    it('on keys that differ only in two nearby bytes', () => {
        function* keys() {
            for (const length of [4, 8, 16, 24]) {
                for (let first = 0; first < length - 1; first += 1) {
                    for (let value = 1; value < 256; value += 1) {
                        const key = new Uint8Array(length);
                        key[first] = value;
                        key[first + 1] = (value * 31) & 0xff;
                        yield key;
                    }
                }
            }
        }
        expect(collisions(keys()).full).toBe(0);
    });
});

describe('distribution', () => {
    it('spreads sequential keys evenly over buckets (chi-square)', () => {
        const buckets = 1024;
        const keys = 1 << 18;
        for (const pick of [
            (key: string) => hashParts(key)[1] & (buckets - 1),
            (key: string) => hashParts(key)[0] >>> 22,
            (key: string) => hash53(key) % buckets,
        ]) {
            const counts = new Float64Array(buckets);
            for (const key of decimals(keys)) counts[pick(key)]! += 1;
            const expected = keys / buckets;
            const chiSquare = counts.reduce(
                (sum, count) => sum + (count - expected) ** 2 / expected,
                0
            );
            expect(chiSquare).toBeLessThan(buckets - 1 + 6 * Math.sqrt(2 * (buckets - 1)));
        }
    });
});
