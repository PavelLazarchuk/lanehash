import { describe, expect, it } from 'vitest';
import { createHasher, hashParts } from './index';
import { referenceHash, utf16le } from './reference';
import { random } from './testing';

const next = random(2026);
const randomBytes = (length: number) => Uint8Array.from({ length }, () => next() & 0xff);
function randomText(length: number): string {
    let text = '';
    while (text.length < length) {
        const roll = next() % 10;
        if (roll < 5) text += String.fromCharCode(32 + (next() % 95));
        else if (roll < 7) text += String.fromCharCode(0x410 + (next() % 64));
        else if (roll < 8) text += String.fromCharCode(0x4e00 + (next() % 2000));
        else if (roll < 9) text += String.fromCodePoint(0x1f300 + (next() % 500));
        else text += String.fromCharCode(0xd800 + (next() % 0x800));
    }
    return text.slice(0, length);
}

const LENGTHS = [
    ...Array.from({ length: 80 }, (_, i) => i),
    127,
    128,
    129,
    255,
    256,
    257,
    1000,
    4099,
];
const SEEDS: bigint[] = [
    0n,
    1n,
    0xffffffffn,
    0x100000000n,
    0xfedcba9876543210n,
    0xffffffffffffffffn,
];

describe('one-shot, streaming and reference agree', () => {
    it('on bytes of every small length and some large ones, with many seeds', () => {
        for (const length of LENGTHS) {
            const bytes = randomBytes(length);
            for (const seed of SEEDS) {
                const expected = referenceHash(bytes, seed);
                expect(hashParts(bytes, seed), `bytes ${length} seed ${seed}`).toEqual(expected);
                expect(createHasher(seed).update(bytes).digestParts()).toEqual(expected);
            }
        }
    });

    it('on strings, which hash as their UTF-16LE bytes', () => {
        for (const length of LENGTHS) {
            const text = randomText(length);
            const bytes = utf16le(text);
            for (const seed of SEEDS) {
                const expected = referenceHash(bytes, seed);
                expect(hashParts(text, seed), `text ${length} seed ${seed}`).toEqual(expected);
                expect(hashParts(bytes, seed)).toEqual(expected);
                expect(createHasher(seed).update(text).digestParts()).toEqual(expected);
            }
        }
    });

    it('whatever the chunk boundaries, for bytes, strings and a mix of both', () => {
        for (let run = 0; run < 300; run += 1) {
            const pieces: (string | Uint8Array)[] = [];
            let total = 0;
            for (let count = 1 + (next() % 8); count > 0; count -= 1) {
                const length = next() % 40;
                const piece = next() % 2 === 0 ? randomText(length) : randomBytes(length);
                pieces.push(piece);
                total += typeof piece === 'string' ? piece.length * 2 : piece.length;
            }
            const all = new Uint8Array(total);
            let offset = 0;
            const hasher = createHasher(BigInt(run));
            for (const piece of pieces) {
                const bytes = typeof piece === 'string' ? utf16le(piece) : piece;
                all.set(bytes, offset);
                offset += bytes.length;
                hasher.update(piece);
            }
            expect(hasher.byteLength).toBe(total);
            expect(hasher.digestParts(), `run ${run}`).toEqual(referenceHash(all, BigInt(run)));
            expect(hashParts(all, BigInt(run))).toEqual(referenceHash(all, BigInt(run)));
        }
    });

    it('when a string starts at an odd byte, splitting a code unit across stripes', () => {
        const text = randomText(100);
        for (let lead = 0; lead < 20; lead += 1) {
            const prefix = randomBytes(lead);
            const all = new Uint8Array(lead + text.length * 2);
            all.set(prefix, 0);
            all.set(utf16le(text), lead);
            expect(
                createHasher().update(prefix).update(text).digestParts(),
                `lead ${lead}`
            ).toEqual(referenceHash(all));
        }
    });
});
