import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import * as entry from './index';
import {
    Hasher,
    createHasher,
    hash32,
    hash53,
    hash64,
    hashHex,
    hashParts,
    type HashInput,
} from './index';
import { utf16le } from './reference';

describe('outputs are views of one 64-bit hash', () => {
    it.each(['', 'a', 'lanehash', 'x'.repeat(1000)])('for %j', text => {
        const full = hash64(text);
        const [high, low] = hashParts(text);
        expect(full).toBe((BigInt(high) << 32n) | BigInt(low));
        expect(hash32(text)).toBe(low);
        expect(hash53(text)).toBe(Number(full >> 11n));
        expect(Number.isSafeInteger(hash53(text))).toBe(true);
        expect(hashHex(text)).toBe(full.toString(16).padStart(16, '0'));
        expect(hashHex(text)).toMatch(/^[0-9a-f]{16}$/);
    });

    it('fits every value in range', () => {
        for (let i = 0; i < 2000; i += 1) {
            const key = `key-${i}`;
            expect(hash64(key)).toBeLessThan(1n << 64n);
            expect(hash53(key)).toBeLessThan(2 ** 53);
            expect(hash32(key)).toBeLessThan(2 ** 32);
            expect(hash32(key)).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('seeds', () => {
    it('default to 0 and accept numbers and bigints alike', () => {
        expect(hash64('abc')).toBe(hash64('abc', 0));
        expect(hash64('abc', 1)).toBe(hash64('abc', 1n));
        expect(hash64('abc', 2 ** 53 - 1)).toBe(hash64('abc', 2n ** 53n - 1n));
        expect(hash64('abc', 2 ** 40)).toBe(hash64('abc', 1n << 40n));
        expect(hash64('abc', 2n ** 64n - 1n)).not.toBe(hash64('abc', 0));
    });

    it('give unrelated hashes, including seeds that differ only above 32 bits', () => {
        const values = new Set([0n, 1n, 2n, 1n << 32n, 1n << 63n].map(seed => hash64('abc', seed)));
        expect(values.size).toBe(5);
    });

    it('reject anything that is not a 64-bit unsigned integer', () => {
        for (const bad of [-1, 1.5, Number.NaN, Infinity, 2 ** 53, '1', null, -1n, 2n ** 64n]) {
            expect(() => hash64('abc', bad as never)).toThrow(RangeError);
        }
        expect(() => hash53('abc', -1)).toThrow(
            'hash53: seed must be a non-negative safe integer or a bigint below 2^64, got -1'
        );
        expect(() => createHasher(-1n)).toThrow('createHasher: seed must be');
        expect(() => new Hasher(-1)).toThrow('new Hasher: seed must be');
    });

    it('never leak from one call into the next', () => {
        const plain = hashHex('first');
        hashHex('other', 12345);
        hash64('other', 1n << 50n);
        expect(hashHex('first')).toBe(plain);
    });
});

describe('inputs', () => {
    const text = 'Hello, мир 🎉';
    const bytes = utf16le(text);

    it('treat every binary container as its bytes, without copying or dropping an offset', () => {
        const expected = hashHex(bytes);
        const padded = new Uint8Array(bytes.length + 8);
        padded.set(bytes, 3);
        const window = padded.subarray(3, 3 + bytes.length);
        const shared = new SharedArrayBuffer(bytes.length);
        new Uint8Array(shared).set(bytes);
        const inputs: HashInput[] = [
            bytes.buffer,
            new DataView(padded.buffer, 3, bytes.length),
            window,
            Buffer.from(bytes),
            new Uint16Array(bytes.buffer),
            shared,
        ];
        for (const input of inputs) expect(hashHex(input)).toBe(expected);
        expect(hashHex(text)).toBe(expected);
    });

    it('read long, unaligned windows correctly', () => {
        const big = Uint8Array.from({ length: 4096 + 5 }, (_, i) => (i * 7) & 255);
        for (let offset = 0; offset < 5; offset += 1) {
            const window = big.subarray(offset, offset + 4096);
            expect(hashHex(window)).toBe(hashHex(window.slice()));
        }
    });

    it('accept typed arrays and buffers from another realm', () => {
        const foreign = runInNewContext('new Uint8Array([1, 2, 3, 4, 5])');
        expect(hashHex(foreign)).toBe(hashHex(new Uint8Array([1, 2, 3, 4, 5])));
        const foreignBuffer = runInNewContext('new Uint8Array([9, 8, 7]).buffer');
        expect(hashHex(foreignBuffer)).toBe(hashHex(new Uint8Array([9, 8, 7])));
    });

    it('reject everything else, naming the function', () => {
        for (const bad of [42, null, undefined, {}, [1, 2, 3], true]) {
            expect(() => hash64(bad as never)).toThrow(TypeError);
        }
        expect(() => hashHex([1, 2] as never)).toThrow(
            'hashHex: expected a string, an ArrayBuffer or a typed array, got object'
        );
        expect(() => createHasher().update(5 as never)).toThrow('update: expected a string');
    });
});

describe('the incremental hasher', () => {
    it('chains, counts bytes and gives every output format', () => {
        const hasher = createHasher(7)
            .update('ab')
            .update(new Uint8Array([1, 2, 3]));
        expect(hasher).toBeInstanceOf(Hasher);
        expect(hasher.byteLength).toBe(7);
        const all = new Uint8Array([...utf16le('ab'), 1, 2, 3]);
        expect(hasher.digest64()).toBe(hash64(all, 7));
        expect(hasher.digest53()).toBe(hash53(all, 7));
        expect(hasher.digest32()).toBe(hash32(all, 7));
        expect(hasher.digestHex()).toBe(hashHex(all, 7));
        expect(hasher.digestParts()).toEqual(hashParts(all, 7));
    });

    it('keeps going after a digest', () => {
        const hasher = new Hasher();
        hasher.update('x'.repeat(20));
        const first = hasher.digestHex();
        expect(hasher.digestHex()).toBe(first);
        hasher.update('y');
        expect(hasher.digestHex()).toBe(hashHex(`${'x'.repeat(20)}y`));
    });

    it('hashes nothing like the empty input', () => {
        expect(createHasher().digestHex()).toBe(hashHex(''));
        expect(createHasher().update('').update(new Uint8Array(0)).digestHex()).toBe(hashHex(''));
    });
});

describe('public entry point', () => {
    it('exports exactly the documented API', () => {
        expect(Object.keys(entry).sort()).toEqual([
            'Hasher',
            'createHasher',
            'hash32',
            'hash53',
            'hash64',
            'hashHex',
            'hashParts',
        ]);
    });
});
