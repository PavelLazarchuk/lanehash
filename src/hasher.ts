import { finishBytes, initLanes, resultHi, stripeBytes, stripeString } from './core';
import { asBytes, readSeed, seedHi, seedLo, type HashInput, type Seed } from './input';
import { toBigInt, toHex, toSafeInteger } from './output';

export class Hasher {
    readonly #seedLo: number;
    readonly #seedHi: number;
    readonly #lanes = new Int32Array(4);
    readonly #pending = new Uint8Array(16);
    #pendingLength = 0;
    #byteLength = 0;

    constructor(seed?: Seed) {
        readSeed(seed, 'new Hasher');
        this.#seedLo = seedLo;
        this.#seedHi = seedHi;
        initLanes(this.#lanes, this.#seedLo, this.#seedHi);
    }

    get byteLength(): number {
        return this.#byteLength;
    }

    update(input: HashInput): this {
        if (typeof input === 'string') this.#updateString(input);
        else this.#updateBytes(asBytes(input, 'update'));
        return this;
    }

    #pushByte(byte: number): void {
        this.#pending[this.#pendingLength] = byte;
        this.#pendingLength += 1;
        if (this.#pendingLength === 16) {
            stripeBytes(this.#lanes, this.#pending, 0, 16);
            this.#pendingLength = 0;
        }
    }

    #updateBytes(bytes: Uint8Array): void {
        const n = bytes.length;
        this.#byteLength += n;
        let offset = 0;
        while (this.#pendingLength > 0 && offset < n) this.#pushByte(bytes[offset++]!);
        if (this.#pendingLength > 0) return;
        offset = stripeBytes(this.#lanes, bytes, offset, n);
        this.#pending.set(bytes.subarray(offset), 0);
        this.#pendingLength = n - offset;
    }

    #updateString(text: string): void {
        const n = text.length;
        this.#byteLength += n * 2;
        let index = 0;
        while (this.#pendingLength > 0 && index < n) {
            const unit = text.charCodeAt(index++);
            this.#pushByte(unit & 0xff);
            this.#pushByte(unit >>> 8);
        }
        index = stripeString(this.#lanes, text, index, n);
        for (; index < n; index += 1) {
            const unit = text.charCodeAt(index);
            this.#pending[this.#pendingLength++] = unit & 0xff;
            this.#pending[this.#pendingLength++] = unit >>> 8;
        }
    }

    #digest(): number {
        return finishBytes(
            this.#seedLo,
            this.#seedHi,
            this.#byteLength >= 16 ? this.#lanes : null,
            this.#byteLength,
            this.#pending,
            0,
            this.#pendingLength
        );
    }

    digest64(): bigint {
        const lo = this.#digest();
        return toBigInt(resultHi, lo);
    }

    digest53(): number {
        const lo = this.#digest();
        return toSafeInteger(resultHi, lo);
    }

    digest32(): number {
        return this.#digest();
    }

    digestHex(): string {
        const lo = this.#digest();
        return toHex(resultHi, lo);
    }

    digestParts(): [high: number, low: number] {
        const lo = this.#digest();
        return [resultHi, lo];
    }
}

export function createHasher(seed?: Seed): Hasher {
    readSeed(seed, 'createHasher');
    return new Hasher(seed);
}
