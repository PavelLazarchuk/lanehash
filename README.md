# lanehash

[![npm version](https://img.shields.io/npm/v/lanehash.svg)](https://www.npmjs.com/package/lanehash)
[![npm downloads](https://img.shields.io/npm/dm/lanehash.svg)](https://www.npmjs.com/package/lanehash)

A fast non-cryptographic 64-bit hash designed for JavaScript engines.

```ts
import { hash53, hash64, hashHex } from 'lanehash';

hash53('user:42'); // 7182174842301635 — a safe integer, ready for Map keys and `%`
hash64('user:42'); // 14709094077033749663n
hashHex('user:42'); // 'cc21332185661c9f' — for cache keys and file names
hashHex(new TextEncoder().encode('hello')); // bytes work too: 'ccf48cafd02afb0e'
```

- **Built for JavaScript** — only 32-bit integer math (`Math.imul`, shifts, xor). No BigInt on the hot path, no WebAssembly, no async initialization.
- **Strings without encoding** — hashed straight from UTF-16 code units, so short keys skip `TextEncoder` entirely. A string hashes exactly like its UTF-16LE bytes, so other languages can reproduce it.
- **Real 64-bit quality** — 64-bit lanes and a multiplicative round; in the avalanche and collision tests below it scores like SHA-256.
- **Every output you need** — 64-bit bigint, 53-bit safe integer, 32-bit, hex, or two 32-bit halves.
- **Streaming and seeds** — feed input in pieces; 64-bit seeds give independent hash functions.
- **Small** — zero dependencies, ~2.4 kB gzipped, ESM + CJS, Node 18+, browsers, Deno, Bun, Workers.

```sh
npm install lanehash
```

> **Not for security.** lanehash is for hash tables, sharding, cache keys,
> deduplication and Bloom filters. Never use it for passwords, signatures or
> integrity checks — use SHA-256 (`crypto.subtle`,
> [`@noble/hashes`](https://www.npmjs.com/package/@noble/hashes)). And if an
> attacker chooses the keys of your hash table, a seed is not a defence against
> deliberate collisions (hash flooding): use a keyed function built for that,
> such as SipHash.

## Why another hash

Hashing a string in JavaScript means picking a trade-off:

| option                                      | catch                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| SHA-256 via `crypto.subtle`                 | asynchronous, and far slower than needed for a hash table                                                          |
| FNV-1a, djb2, `String.hashCode`-style loops | 32 bits, and weak: flipping some input bits never changes some output bits                                         |
| cyrb53                                      | fast, but in the avalanche test below some output bits flip 72–88% of the time instead of 50%                      |
| xxhash-wasm                                 | excellent and very fast on long input, but asynchronous to load, WebAssembly, and strings go through `TextEncoder` |

lanehash aims at the gap: synchronous, pure JavaScript, 64 bits of real
quality, and quick where JavaScript apps hash most — short string keys.

## API

```ts
hash64(input, seed?): bigint // the full 64-bit hash
hash53(input, seed?): number // its top 53 bits — a safe integer
hash32(input, seed?): number // its low 32 bits, unsigned
hashHex(input, seed?): string // 16 lowercase hex digits
hashParts(input, seed?): [high, low] // two unsigned 32-bit numbers, no bigint

createHasher(seed?) // incremental: .update(input) … .digest64() / digest53() / digest32() / digestHex() / digestParts()
```

All outputs are views of one 64-bit value: `hash53 = hash64 >> 11`,
`hash32 = hash64 & 0xffffffff`.

**Input** is a string, an `ArrayBuffer`, a `SharedArrayBuffer` or any typed
array / `DataView` / Node `Buffer` (its bytes, never copied). A string is hashed
as its UTF-16LE bytes — `hash64('hé') === hash64(Buffer.from('hé', 'utf16le'))`.

**Seeds** are a non-negative safe integer or a bigint below 2^64; the default
is 0. Different seeds give independent hash functions — for Bloom filters,
cuckoo hashing or several tables over the same keys.

### Which output?

Collisions become likely around the square root of the output space:

| output               | likely first collision | good for                                                     |
| -------------------- | ---------------------- | ------------------------------------------------------------ |
| `hash64` / `hashHex` | ~4 billion keys        | content fingerprints, dedupe at scale                        |
| `hash53`             | ~95 million keys       | Map keys, IDs in JSON, bucketing with `%`                    |
| `hash32`             | ~77,000 keys           | hash tables and buckets, where collisions are handled anyway |

### Streaming

```ts
const hasher = createHasher();
for await (const chunk of file.stream()) hasher.update(chunk);
hasher.digestHex(); // same as hashing the whole file at once
```

Strings and bytes can be mixed freely; the result is always the hash of the
concatenated bytes, wherever the pieces are cut.

### Recipes

```ts
// Shard / bucket: stable across runs and machines.
const shard = hash53(userId) % shardCount;

// Cache key from a request.
const key = hashHex(`${method} ${url}\n${body}`);

// Bloom filter: two independent 32-bit values give k probe positions.
const [h1, h2] = hashParts(item);
for (let i = 0; i < k; i++) bits.set((h1 + i * h2) % size);

// Deduplicate documents.
const seen = new Set<bigint>();
const unique = docs.filter(doc => {
    const fingerprint = hash64(doc.text);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
});
```

## Quality

`npm run quality` (20,000 samples per length; Node 24):

| hash                      | worst avalanche bias: UTF-16, 4 / 16 / 40 units | ASCII, 16 chars | low-32 collisions, 1M keys | low-32 collisions, 9! permutations | full collisions, 200K same-lane keys | full collisions, all sets |
| ------------------------- | ----------------------------------------------- | --------------: | -------------------------: | ---------------------------------: | -----------------------------------: | ------------------------: |
| SHA-256 (ideal reference) | 0.015 / 0.014 / 0.031                           |           0.013 |                        104 |                                 15 |                                    0 |                         0 |
| **lanehash**              | **0.015 / 0.015 / 0.030**                       |       **0.013** |                    **111** |                             **14** |                                **0** |                     **0** |
| cyrb53                    | 0.375 / 0.376 / 0.380                           |           0.222 |                        119 |                                 13 |                                    0 |                         0 |
| FNV-1a 32                 | 0.500 / 0.500 / 0.500                           |           0.500 |                          8 |                                 58 |                                    2 |                        68 |

- **Avalanche bias** is how far, at worst, the chance that an output bit flips
  when one input bit flips strays from ½. An ideal hash shows only sampling
  noise — the SHA-256 row. 0.5 means some output bit never (or always) reacts.
- **Collisions** of the low 32 bits should be near 128 for a million keys and 15
  for the 362,880 permutations; the full 64-bit hash should have none.
- **Same-lane keys** differ only in two 32-bit words 16 bytes apart — the
  pattern that breaks hashes built from 32-bit lanes (see below).

How the function is held to this:

- **A frozen specification.** Known-answer vectors pin LaneHash-64 v1; outputs never change within a major version.
- **Three implementations that must agree** — the optimized one-shot code, the streaming hasher and a plain reference written from the specification below (with BigInt for the products) — on every length up to 80, larger sizes, many seeds, random chunkings and strings with surrogates.
- **A statistical test suite in CI** — exhaustive avalanche over every 1- and 2-byte input, sampled avalanche for bytes, strings and seeds; collisions on sequential, sparse, all-zero, repeated, two-byte, permuted and same-lane keys; chi-square bucket distribution. Thresholds come from the noise an ideal random function shows.
- **Deliberately broken variants** — the original 32-bit additive lanes, a length left out of the hash, string lanes without the product — are each caught by the suite.

**History.** The first design used four 32-bit lanes that added each word in,
xxHash32-style. A code review before release showed two flaws: keys varying
only in one lane's words collided after ~77,000 keys instead of billions, and
some word pairs collided under every seed. Both attacks are now regression
tests, and the round was redesigned: two 64-bit lanes, with each word pair
mixed in through a full 32×32→64-bit product of state-dependent values.

It is a new function: it has not had the years of independent scrutiny that
xxHash or SipHash have had. That is fine for its purpose, and one more reason
never to use it for security.

## Performance

`npm run bench` — calls per second on Node 24, Apple Silicon (higher is better):

|                               | short ASCII keys (8–32) | short non-ASCII keys | 256-char strings | 64K-char string | 1 MiB of bytes |
| ----------------------------- | ----------------------: | -------------------: | ---------------: | --------------: | -------------: |
| **lanehash `hash53`**         |               **11.8M** |            **11.7M** |        **2.88M** |       **12.9K** |       **2.5K** |
| cyrb53                        |                   24.0M |                21.0M |            2.90M |           12.0K |              — |
| FNV-1a 32                     |                   23.4M |                21.0M |            2.91M |           12.0K |              — |
| xxhash-wasm `h32`             |                    9.9M |                 5.7M |            8.78M |           92.1K |           6.2K |
| @node-rs/xxhash xxh3 (native) |                    5.6M |                 3.4M |            3.57M |           27.5K |          13.8K |
| js-xxhash                     |                    3.7M |                 2.6M |            2.45M |           18.7K |           1.6K |
| murmurhash v3                 |                    3.6M |                 2.4M |            1.82M |           11.1K |              — |

Honest reading:

- On **short keys** — the common case — lanehash is 1.2–2× faster than xxhash-wasm, 2–3.4× faster than the native xxHash binding (crossing into native code costs more than hashing a short key), and 3–5× faster than other pure-JS xxHash and Murmur ports. cyrb53 and FNV-1a are twice as fast, and they pay for it with the quality failures above.
- On **long strings and large buffers**, xxhash-wasm and native xxHash win clearly — they encode with SIMD in C++ and hash in compiled code — and js-xxhash is faster too on very long strings. If you mostly hash megabytes, use one of them.
- `hash64` costs a bigint allocation; prefer `hash53`, `hashHex` or `hashParts` in hot loops.

## The algorithm: LaneHash-64 v1

The input is a byte sequence of length `n` (a string is its UTF-16LE bytes).
All arithmetic is modulo 2^32; words are read little-endian; `a × b` below is
the full 64-bit product of two 32-bit values, split into `(lo, hi)`.

```
K0 = 0x9E3779B9  K1 = 0x7F4A7C15                  // golden ratio
K2 = 0x6A09E667  K3 = 0xBB67AE85  K4 = 0x3C6EF372  K5 = 0xA54FF53A   // √2 √3 √5 √7
seed = (seedHi << 32) | seedLo

round((x, y), p, q):
    a = x ^ p;  b = y ^ q;  (lo, hi) = a × b
    y' = b + hi;  x' = (a + lo) ^ y'
    return (x', y')

acc = ((seedLo ^ K4) + (n mod 2^32),  (seedHi ^ K5) ^ (⌊n / 2^32⌋ × K0 mod 2^32))
if n ≥ 16:
    lane0 = (seedLo ^ K0, seedHi ^ K1);  lane1 = (seedLo ^ K2, seedHi ^ K3)
    for each whole 16-byte stripe, words w0..w3:
        lane0 = round(lane0, w0, w1);  lane1 = round(lane1, w2, w3)
    acc = round(acc, lane0.x, lane0.y);  acc = round(acc, lane1.x, lane1.y)
r = the remaining 0–15 bytes as four zero-padded words t0..t3
if r > 0: acc = round(acc, t0, t1)
if r > 8: acc = round(acc, t2, t3)

finish (a, b) = acc:
    a = a + b;  b = b + a
    a = lowbias32(a)        // x ^= x>>>16; x ×= 0x7FEB352D; x ^= x>>>15; x ×= 0x846CA68B; x ^= x>>>16
    b = murmur3_fmix32(b)   // x ^= x>>>16; x ×= 0x85EBCA6B; x ^= x>>>13; x ×= 0xC2B2AE35; x ^= x>>>16
    a = a + b;  b = b + a
hash = (a << 32) | b
```

Multiplying two state-dependent values makes the effect of any input
difference depend on the seeded state, so differences cannot be steered to
cancel; adding `a` and `b` back in means a zero product loses no input. In
JavaScript, the high half of the product comes from four 16×16-bit `Math.imul`
products, exact in 32 bits. Check vectors: `hashHex('') === 'bd63ad70f8e876d4'`,
`hashHex('abc') === '1e9b4afce766c347'`, `hashHex('abc', 1) === '5abc20233d086d3b'`.

## License

MIT
