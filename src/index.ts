import { hashBytes, hashString, resultHi } from './core';
import { asBytes, readSeed, seedHi, seedLo, type HashInput, type Seed } from './input';
import { toBigInt, toHex, toSafeInteger } from './output';

export { Hasher, createHasher } from './hasher';
export type { HashInput, Seed } from './input';

function run(input: HashInput, seed: Seed | undefined, name: string): number {
    if (seed === undefined) {
        return typeof input === 'string'
            ? hashString(input, 0, 0)
            : hashBytes(asBytes(input, name), 0, 0);
    }
    readSeed(seed, name);
    return typeof input === 'string'
        ? hashString(input, seedLo, seedHi)
        : hashBytes(asBytes(input, name), seedLo, seedHi);
}

export function hash64(input: HashInput, seed?: Seed): bigint {
    const lo = run(input, seed, 'hash64');
    return toBigInt(resultHi, lo);
}

export function hash53(input: HashInput, seed?: Seed): number {
    const lo = run(input, seed, 'hash53');
    return toSafeInteger(resultHi, lo);
}

export function hash32(input: HashInput, seed?: Seed): number {
    return run(input, seed, 'hash32');
}

export function hashHex(input: HashInput, seed?: Seed): string {
    const lo = run(input, seed, 'hashHex');
    return toHex(resultHi, lo);
}

export function hashParts(input: HashInput, seed?: Seed): [high: number, low: number] {
    const lo = run(input, seed, 'hashParts');
    return [resultHi, lo];
}
