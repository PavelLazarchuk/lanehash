export type HashInput = string | ArrayBuffer | SharedArrayBuffer | ArrayBufferView;

export type Seed = number | bigint;

const TWO_32 = 4_294_967_296;
const tagOf = (value: unknown) => Object.prototype.toString.call(value);

export function asBytes(input: unknown, name: string): Uint8Array {
    if (input instanceof Uint8Array) return input;
    if (ArrayBuffer.isView(input))
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    const tag = tagOf(input);
    if (tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]') {
        return new Uint8Array(input as ArrayBuffer);
    }
    throw new TypeError(
        `${name}: expected a string, an ArrayBuffer or a typed array, got ${input === null ? 'null' : typeof input}`
    );
}

export let seedLo = 0;
export let seedHi = 0;

export function readSeed(seed: Seed | undefined, name: string): void {
    if (seed === undefined) {
        seedLo = 0;
        seedHi = 0;
    } else if (typeof seed === 'number' && Number.isSafeInteger(seed) && seed >= 0) {
        seedLo = seed % TWO_32;
        seedHi = Math.floor(seed / TWO_32);
    } else if (typeof seed === 'bigint' && seed >= 0n && seed < 1n << 64n) {
        seedLo = Number(seed & 0xffffffffn);
        seedHi = Number(seed >> 32n);
    } else {
        throw new RangeError(
            `${name}: seed must be a non-negative safe integer or a bigint below 2^64, got ${String(seed)}`
        );
    }
}
