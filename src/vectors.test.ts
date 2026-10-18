import { describe, expect, it } from 'vitest';
import { hashHex } from './index';
import { referenceHash, utf16le } from './reference';

const STRINGS: [string, number, string][] = [
    ['', 0, 'bd63ad70f8e876d4'],
    ['a', 0, '361664b886801414'],
    ['abc', 0, '1e9b4afce766c347'],
    ['lanehash', 0, 'da5dfee51a3a0c47'],
    ['Hello, world!', 0, '71e7eebaeede5f53'],
    ['The quick brown fox jumps over the lazy dog', 0, '0f1e10ecbbb061bd'],
    ['Привет, мир', 0, 'cb0a4e1351175d74'],
    ['🎉', 0, '1cf99573135b40ab'],
    ['abc', 1, '5abc20233d086d3b'],
    ['abc', 4294967296, '2da8080ef150d900'],
    ['abc', 9007199254740991, '6fdd209987bdea8e'],
];

const BYTES: [number, string][] = [
    [0, 'bd63ad70f8e876d4'],
    [1, 'e7dfca0f751d054c'],
    [3, '6a9035cd252ae5ac'],
    [4, 'ccb8672b4727998f'],
    [15, '5eda039a40df5cec'],
    [16, 'b7a37f28db4ad1e0'],
    [17, '1b00fa63654d5093'],
    [31, 'e03635dba9fcae93'],
    [32, 'ca7fe87b685aa325'],
    [63, 'e34fedefaf648193'],
    [64, 'ea45785144fe32e5'],
    [127, 'cb0f7a43dfaa5a44'],
    [128, '973a32853ed24cd5'],
    [129, 'bf613f6dfcb6680e'],
    [1000, 'a7f7f800dfb40668'],
];

const pattern = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255);
const hex = ([high, low]: [number, number]) =>
    high.toString(16).padStart(8, '0') + low.toString(16).padStart(8, '0');

describe('known answers (LaneHash-64 v1)', () => {
    it.each(STRINGS)('string %j with seed %d', (text, seed, expected) => {
        expect(hashHex(text, seed)).toBe(expected);
        expect(hex(referenceHash(utf16le(text), BigInt(seed)))).toBe(expected);
    });

    it.each(BYTES)('%d pattern bytes', (length, expected) => {
        expect(hashHex(pattern(length))).toBe(expected);
        expect(hex(referenceHash(pattern(length)))).toBe(expected);
    });

    it('takes a full 64-bit bigint seed', () => {
        expect(hashHex('abc', 0xfedcba9876543210n)).toBe('ed2344b8ec64804b');
        expect(hex(referenceHash(utf16le('abc'), 0xfedcba9876543210n))).toBe('ed2344b8ec64804b');
    });

    it('matches the reference for the empty input of both kinds', () => {
        expect(hashHex('')).toBe(hashHex(new Uint8Array(0)));
    });
});
