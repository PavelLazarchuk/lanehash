import { createHash } from 'node:crypto';
import { hashParts } from '../dist/index.js';
import { cyrb53Parts, fnv1a, random } from './shared.mjs';

const SAMPLES = Number(process.env.SAMPLES ?? 20_000);

const fnv1aParts = text => [0, fnv1a(text)];

function sha256Parts(text) {
    const digest = createHash('sha256').update(text, 'utf16le').digest();
    return [digest.readUInt32BE(0), digest.readUInt32BE(4)];
}

const HASHES = [
    { name: 'SHA-256 (ideal reference)', parts: sha256Parts, bits: 64 },
    { name: 'lanehash', parts: text => hashParts(text), bits: 64 },
    { name: 'cyrb53', parts: cyrb53Parts, bits: 53 },
    { name: 'FNV-1a 32', parts: fnv1aParts, bits: 32 },
];

function avalanche({ parts, bits }, length, samples, unitBits = 16) {
    const next = random(length * unitBits);
    const mask = (1 << unitBits) - 1;
    const inputBits = length * unitBits;
    const flips = new Float64Array(inputBits * 64);
    const units = new Array(length);
    for (let sample = 0; sample < samples; sample++) {
        for (let k = 0; k < length; k++) units[k] = next() & mask;
        const [high, low] = parts(String.fromCharCode(...units));
        for (let bit = 0; bit < inputBits; bit++) {
            const unit = Math.floor(bit / unitBits);
            const flip = 1 << (bit % unitBits);
            units[unit] ^= flip;
            const [h, l] = parts(String.fromCharCode(...units));
            units[unit] ^= flip;
            const dl = (l ^ low) >>> 0;
            const dh = (h ^ high) >>> 0;
            for (let out = 0; out < 32; out++) {
                flips[bit * 64 + out] += (dl >>> out) & 1;
                flips[bit * 64 + 32 + out] += (dh >>> out) & 1;
            }
        }
    }
    let worst = 0;
    for (let bit = 0; bit < inputBits; bit++) {
        for (let out = 0; out < bits; out++) {
            worst = Math.max(worst, Math.abs(flips[bit * 64 + out] / samples - 0.5));
        }
    }
    return worst;
}

function collisions({ parts }, keys) {
    const lows = new Set();
    const fulls = new Set();
    let low = 0;
    let full = 0;
    for (const key of keys) {
        const [h, l] = parts(key);
        if (lows.has(l)) low++;
        lows.add(l);
        const both = `${h}:${l}`;
        if (fulls.has(both)) full++;
        fulls.add(both);
    }
    return { low, full };
}

const sequential = Array.from({ length: 1 << 20 }, (_, i) => `user:${i}`);
const permutations = [];
(function permute(rest, prefix) {
    if (rest.length === 0) permutations.push(prefix);
    rest.forEach((value, index) =>
        permute([...rest.slice(0, index), ...rest.slice(index + 1)], prefix + value)
    );
})(['ab', 'cd', 'ef', 'gh', 'ij', 'kl', 'mn', 'op', 'qr'], '');

const laneLocal = (() => {
    const next = random(404);
    return Array.from({ length: 200_000 }, () => {
        const units = new Array(16).fill(0x61);
        for (const index of [0, 1, 8, 9]) units[index] = next() & 0xffff;
        return String.fromCharCode(...units);
    });
})();

const expected = n => ((n * (n - 1)) / 2 / 2 ** 32).toFixed(0);
console.log(`Node ${process.versions.node}, ${SAMPLES} avalanche samples per length\n`);
console.log(
    '| hash | worst avalanche bias: UTF-16, 4 / 16 / 40 units | ASCII, 16 chars | low-32 collisions, 1M keys | low-32 collisions, 9! permutations | full-width collisions, 200K same-lane keys | full-width collisions, all sets |'
);
console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: |');
for (const hash of HASHES) {
    const biases = [4, 16, 40].map(length =>
        avalanche(hash, length, length > 16 ? SAMPLES / 4 : SAMPLES).toFixed(3)
    );
    const ascii = avalanche(hash, 16, SAMPLES, 7).toFixed(3);
    const a = collisions(hash, sequential);
    const b = collisions(hash, permutations);
    const c = collisions(hash, laneLocal);
    console.log(
        `| ${hash.name} | ${biases.join(' / ')} | ${ascii} | ${a.low} | ${b.low} | ${c.full} | ${a.full + b.full + c.full} |`
    );
}
console.log(
    `\nAn ideal 32-bit output expects about ${expected(sequential.length)} and ${expected(permutations.length)} low-32 collisions; ` +
        `the avalanche bias of an ideal hash is pure sampling noise, the SHA-256 row.`
);
