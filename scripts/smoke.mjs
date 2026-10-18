import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const load = specifier => import(new URL(specifier, import.meta.url).href);

const [major] = process.versions.node.split('.').map(Number);
assert.ok(major >= 18, `expected Node >= 18, got ${process.versions.node}`);

const esm = await load('../dist/index.js');
const { hash64, hash53, hash32, hashHex, hashParts, createHasher, Hasher } = esm;

assert.equal(hashHex(''), 'bd63ad70f8e876d4');
assert.equal(hashHex('abc'), '1e9b4afce766c347');
assert.equal(hashHex('Привет, мир'), 'cb0a4e1351175d74');
assert.equal(hashHex('abc', 1), '5abc20233d086d3b');
assert.equal(hashHex('abc', 0xfedcba9876543210n), 'ed2344b8ec64804b');

const utf16le = text => Buffer.from(text, 'utf16le');
const text = 'The quick brown fox jumps over the lazy dog 🦊';
assert.equal(hashHex(text), hashHex(utf16le(text)), 'a string and its UTF-16LE bytes disagree');
assert.equal(hashHex(text), hashHex(new Uint8Array(utf16le(text)).buffer));

const full = hash64(text);
const [high, low] = hashParts(text);
assert.equal(full, (BigInt(high) << 32n) | BigInt(low));
assert.equal(hash53(text), Number(full >> 11n));
assert.equal(hash32(text), low);

const hasher = createHasher(42)
    .update('The quick ')
    .update(utf16le('brown fox '))
    .update('jumps over the lazy dog 🦊');
assert.ok(hasher instanceof Hasher);
assert.equal(hasher.digestHex(), hashHex(text, 42), 'streaming disagrees with one-shot');

const big = new Uint8Array(1 << 20).map((_, i) => (i * 2654435761) >>> 24);
assert.equal(
    createHasher().update(big.subarray(0, 333_333)).update(big.subarray(333_333)).digestHex(),
    hashHex(big)
);

assert.throws(() => hash64('x', -1), RangeError);
assert.throws(() => hash64(42), TypeError);

const cjs = require('../dist/index.cjs');
assert.equal(cjs.hashHex('abc'), '1e9b4afce766c347');
assert.deepEqual(
    Object.keys(cjs).sort(),
    Object.keys(esm).sort(),
    'CJS and ESM entry points disagree'
);

console.log(`smoke: ok on Node ${process.versions.node}`);
