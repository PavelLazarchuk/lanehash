import { xxh3, xxh64 } from '@node-rs/xxhash';
import { xxHash32 } from 'js-xxhash';
import murmurhash from 'murmurhash';
import xxhashWasm from 'xxhash-wasm';
import XXH from 'xxhashjs';
import { hash53, hash64 } from '../dist/index.js';
import { cyrb53, fnv1a } from '../scripts/shared.mjs';

const wasm = await xxhashWasm();

let seed = 1;
const random = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
const ascii = length =>
    Array.from({ length }, () => String.fromCharCode(32 + Math.floor(random() * 95))).join('');
const mixed = length =>
    Array.from({ length }, () => {
        const pick = random();
        if (pick < 0.5) return String.fromCharCode(0x430 + Math.floor(random() * 32));
        if (pick < 0.8) return String.fromCharCode(97 + Math.floor(random() * 26));
        return '🎉';
    }).join('');

const sets = [
    {
        name: 'short ASCII strings (8–32 chars)',
        inputs: Array.from({ length: 1024 }, () => ascii(8 + Math.floor(random() * 25))),
    },
    {
        name: 'short non-ASCII strings (8–32 chars)',
        inputs: Array.from({ length: 1024 }, () => mixed(8 + Math.floor(random() * 25))),
    },
    { name: '256-char ASCII strings', inputs: Array.from({ length: 256 }, () => ascii(256)) },
    { name: '64K-char ASCII string', inputs: [ascii(65_536)] },
    {
        name: '1 MiB of bytes',
        inputs: [Uint8Array.from({ length: 1 << 20 }, () => Math.floor(random() * 256))],
    },
];

const forStrings = {
    'lanehash hash53': s => hash53(s),
    'lanehash hash64 (bigint)': s => hash64(s),
    cyrb53: s => cyrb53(s),
    'FNV-1a 32': s => fnv1a(s),
    'murmurhash v3 (32-bit)': s => murmurhash.v3(s),
    'js-xxhash xxHash32': s => xxHash32(s),
    'xxhash-wasm h32': s => wasm.h32(s),
    'xxhash-wasm h64 (bigint)': s => wasm.h64(s),
    'xxhashjs h32': s => XXH.h32(s, 0).toNumber(),
    '@node-rs/xxhash xxh3 (native)': s => xxh3.xxh64(s),
};
const forBytes = {
    'lanehash hash53': b => hash53(b),
    'lanehash hash64 (bigint)': b => hash64(b),
    'js-xxhash xxHash32': b => xxHash32(b),
    'xxhash-wasm h32Raw': b => wasm.h32Raw(b),
    'xxhash-wasm h64Raw (bigint)': b => wasm.h64Raw(b),
    '@node-rs/xxhash xxh64 (native)': b => xxh64(b),
};

let sink = 0;
const fold = value =>
    typeof value === 'bigint'
        ? Number(value & 0xffffn)
        : typeof value === 'number'
          ? value & 0xffff
          : 0;
const bytesOf = input => (typeof input === 'string' ? input.length * 2 : input.length);

function measure(fn, inputs) {
    const average = inputs.reduce((sum, input) => sum + bytesOf(input), 0) / inputs.length;
    const batch = Math.max(1, Math.floor(2_000_000 / Math.max(average, 1) / 8));
    for (let i = 0; i < batch * 4; i += 1) sink ^= fold(fn(inputs[i % inputs.length]));
    let calls = 0;
    const start = performance.now();
    let now = start;
    while (now - start < 500) {
        for (let i = 0; i < batch; i += 1) sink ^= fold(fn(inputs[(calls + i) % inputs.length]));
        calls += batch;
        now = performance.now();
    }
    const seconds = (now - start) / 1000;
    return {
        opsPerSecond: calls / seconds,
        megabytesPerSecond: (calls * average) / seconds / 1_048_576,
    };
}

console.log(`Node ${process.versions.node} on ${process.platform}/${process.arch}\n`);
for (const { name, inputs } of sets) {
    const table = typeof inputs[0] === 'string' ? forStrings : forBytes;
    const rows = Object.entries(table)
        .map(([label, fn]) => ({ label, ...measure(fn, inputs) }))
        .sort((a, b) => b.opsPerSecond - a.opsPerSecond);
    console.log(`### ${name}\n`);
    console.log('| hash | calls/s | MB/s |');
    console.log('| --- | ---: | ---: |');
    for (const row of rows) {
        console.log(
            `| ${row.label} | ${Math.round(row.opsPerSecond).toLocaleString('en-US')} | ${row.megabytesPerSecond.toFixed(0)} |`
        );
    }
    console.log('');
}
if (sink === 0.5) console.log(sink);
