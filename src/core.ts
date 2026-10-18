const imul = Math.imul;

const K0 = 0x9e3779b9 | 0;
const K1 = 0x7f4a7c15 | 0;
const K2 = 0x6a09e667 | 0;
const K3 = 0xbb67ae85 | 0;
const K4 = 0x3c6ef372 | 0;
const K5 = 0xa54ff53a | 0;

const TWO_32 = 4_294_967_296;

export let resultHi = 0;

let RX = 0;
let RY = 0;

function round(x: number, y: number, p: number, q: number): void {
    const a = x ^ p;
    const b = y ^ q;
    const a0 = a & 0xffff;
    const a1 = a >>> 16;
    const b0 = b & 0xffff;
    const b1 = b >>> 16;
    const p01 = imul(a0, b1);
    const p10 = imul(a1, b0);
    const middle = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
    RY = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (middle >>> 16)) | 0;
    RX = ((a + imul(a, b)) | 0) ^ RY;
}

function finish(accumulatorA: number, accumulatorB: number): number {
    let a = (accumulatorA + accumulatorB) | 0;
    let b = (accumulatorB + a) | 0;
    a ^= a >>> 16;
    a = imul(a, 0x7feb352d);
    a ^= a >>> 15;
    a = imul(a, 0x846ca68b | 0);
    a ^= a >>> 16;
    b ^= b >>> 16;
    b = imul(b, 0x85ebca6b | 0);
    b ^= b >>> 13;
    b = imul(b, 0xc2b2ae35 | 0);
    b ^= b >>> 16;
    a = (a + b) | 0;
    b = (b + a) | 0;
    resultHi = a >>> 0;
    return b >>> 0;
}

export function initLanes(lanes: Int32Array, seedLo: number, seedHi: number): void {
    lanes[0] = seedLo ^ K0;
    lanes[1] = seedHi ^ K1;
    lanes[2] = seedLo ^ K2;
    lanes[3] = seedHi ^ K3;
}

const DATA_VIEW_FROM = 128;

export function stripeBytes(
    lanes: Int32Array,
    bytes: Uint8Array,
    offset: number,
    end: number
): number {
    let x0 = lanes[0] as number;
    let y0 = lanes[1] as number;
    let x1 = lanes[2] as number;
    let y1 = lanes[3] as number;
    const view =
        end - offset >= DATA_VIEW_FROM
            ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
            : null;
    let i = offset;
    let a: number, b: number, a0: number, a1: number, b0: number, b1: number;
    let p01: number, p10: number, m: number;
    for (const last = end - 16; i <= last; i += 16) {
        if (view) {
            a = x0 ^ view.getInt32(i, true);
            b = y0 ^ view.getInt32(i + 4, true);
        } else {
            a =
                x0 ^
                (bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24));
            b =
                y0 ^
                (bytes[i + 4]! |
                    (bytes[i + 5]! << 8) |
                    (bytes[i + 6]! << 16) |
                    (bytes[i + 7]! << 24));
        }
        a0 = a & 0xffff;
        a1 = a >>> 16;
        b0 = b & 0xffff;
        b1 = b >>> 16;
        p01 = imul(a0, b1);
        p10 = imul(a1, b0);
        m = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
        y0 = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (m >>> 16)) | 0;
        x0 = ((a + imul(a, b)) | 0) ^ y0;

        if (view) {
            a = x1 ^ view.getInt32(i + 8, true);
            b = y1 ^ view.getInt32(i + 12, true);
        } else {
            a =
                x1 ^
                (bytes[i + 8]! |
                    (bytes[i + 9]! << 8) |
                    (bytes[i + 10]! << 16) |
                    (bytes[i + 11]! << 24));
            b =
                y1 ^
                (bytes[i + 12]! |
                    (bytes[i + 13]! << 8) |
                    (bytes[i + 14]! << 16) |
                    (bytes[i + 15]! << 24));
        }
        a0 = a & 0xffff;
        a1 = a >>> 16;
        b0 = b & 0xffff;
        b1 = b >>> 16;
        p01 = imul(a0, b1);
        p10 = imul(a1, b0);
        m = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
        y1 = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (m >>> 16)) | 0;
        x1 = ((a + imul(a, b)) | 0) ^ y1;
    }
    lanes[0] = x0;
    lanes[1] = y0;
    lanes[2] = x1;
    lanes[3] = y1;
    return i;
}

export function stripeString(lanes: Int32Array, text: string, offset: number, end: number): number {
    let x0 = lanes[0] as number;
    let y0 = lanes[1] as number;
    let x1 = lanes[2] as number;
    let y1 = lanes[3] as number;
    let i = offset;
    let a: number, b: number, a0: number, a1: number, b0: number, b1: number;
    let p01: number, p10: number, m: number;
    for (const last = end - 8; i <= last; i += 8) {
        a = x0 ^ (text.charCodeAt(i) | (text.charCodeAt(i + 1) << 16));
        b = y0 ^ (text.charCodeAt(i + 2) | (text.charCodeAt(i + 3) << 16));
        a0 = a & 0xffff;
        a1 = a >>> 16;
        b0 = b & 0xffff;
        b1 = b >>> 16;
        p01 = imul(a0, b1);
        p10 = imul(a1, b0);
        m = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
        y0 = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (m >>> 16)) | 0;
        x0 = ((a + imul(a, b)) | 0) ^ y0;

        a = x1 ^ (text.charCodeAt(i + 4) | (text.charCodeAt(i + 5) << 16));
        b = y1 ^ (text.charCodeAt(i + 6) | (text.charCodeAt(i + 7) << 16));
        a0 = a & 0xffff;
        a1 = a >>> 16;
        b0 = b & 0xffff;
        b1 = b >>> 16;
        p01 = imul(a0, b1);
        p10 = imul(a1, b0);
        m = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
        y1 = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (m >>> 16)) | 0;
        x1 = ((a + imul(a, b)) | 0) ^ y1;
    }
    lanes[0] = x0;
    lanes[1] = y0;
    lanes[2] = x1;
    lanes[3] = y1;
    return i;
}

export function finishHash(
    seedLo: number,
    seedHi: number,
    lanes: Int32Array | null,
    byteLength: number,
    tail0: number,
    tail1: number,
    tail2: number,
    tail3: number,
    tailLength: number
): number {
    let a = (seedLo ^ K4) + byteLength;
    let b = seedHi ^ K5 ^ imul(Math.floor(byteLength / TWO_32), K0);
    a |= 0;
    if (lanes) {
        round(a, b, lanes[0] as number, lanes[1] as number);
        round(RX, RY, lanes[2] as number, lanes[3] as number);
        a = RX;
        b = RY;
    }
    if (tailLength > 0) {
        round(a, b, tail0, tail1);
        a = RX;
        b = RY;
        if (tailLength > 8) {
            round(a, b, tail2, tail3);
            a = RX;
            b = RY;
        }
    }
    return finish(a, b);
}

let T0 = 0;
let T1 = 0;
let T2 = 0;
let T3 = 0;

function packTail(bytes: Uint8Array, offset: number, end: number): void {
    T0 = 0;
    T1 = 0;
    T2 = 0;
    T3 = 0;
    for (let k = 0; offset + k < end; k += 1) {
        const value = bytes[offset + k]! << ((k & 3) * 8);
        if (k < 4) T0 |= value;
        else if (k < 8) T1 |= value;
        else if (k < 12) T2 |= value;
        else T3 |= value;
    }
}

export function finishBytes(
    seedLo: number,
    seedHi: number,
    lanes: Int32Array | null,
    byteLength: number,
    tail: Uint8Array,
    tailOffset: number,
    tailEnd: number
): number {
    packTail(tail, tailOffset, tailEnd);
    return finishHash(seedLo, seedHi, lanes, byteLength, T0, T1, T2, T3, tailEnd - tailOffset);
}

const scratchLanes = new Int32Array(4);

export function hashBytes(bytes: Uint8Array, seedLo: number, seedHi: number): number {
    const n = bytes.length;
    let i = 0;
    let x = ((seedLo ^ K4) + n) | 0;
    let y = seedHi ^ K5 ^ imul(Math.floor(n / TWO_32), K0);
    let a: number, b: number, a0: number, a1: number, b0: number, b1: number;
    let p01: number, p10: number, m: number;
    if (n >= 16) {
        initLanes(scratchLanes, seedLo, seedHi);
        i = stripeBytes(scratchLanes, bytes, 0, n);
        a = x ^ scratchLanes[0]!;
        b = y ^ scratchLanes[1]!;
        a0 = a & 0xffff;
        a1 = a >>> 16;
        b0 = b & 0xffff;
        b1 = b >>> 16;
        p01 = imul(a0, b1);
        p10 = imul(a1, b0);
        m = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
        y = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (m >>> 16)) | 0;
        x = ((a + imul(a, b)) | 0) ^ y;
        a = x ^ scratchLanes[2]!;
        b = y ^ scratchLanes[3]!;
        a0 = a & 0xffff;
        a1 = a >>> 16;
        b0 = b & 0xffff;
        b1 = b >>> 16;
        p01 = imul(a0, b1);
        p10 = imul(a1, b0);
        m = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
        y = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (m >>> 16)) | 0;
        x = ((a + imul(a, b)) | 0) ^ y;
    }
    const remaining = n - i;
    if (remaining > 0) {
        let w0 = 0;
        let w1 = 0;
        let w2 = 0;
        let w3 = 0;
        for (let k = 0; k < remaining; k += 1) {
            const value = bytes[i + k]! << ((k & 3) * 8);
            if (k < 4) w0 |= value;
            else if (k < 8) w1 |= value;
            else if (k < 12) w2 |= value;
            else w3 |= value;
        }
        a = x ^ w0;
        b = y ^ w1;
        a0 = a & 0xffff;
        a1 = a >>> 16;
        b0 = b & 0xffff;
        b1 = b >>> 16;
        p01 = imul(a0, b1);
        p10 = imul(a1, b0);
        m = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
        y = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (m >>> 16)) | 0;
        x = ((a + imul(a, b)) | 0) ^ y;
        if (remaining > 8) {
            a = x ^ w2;
            b = y ^ w3;
            a0 = a & 0xffff;
            a1 = a >>> 16;
            b0 = b & 0xffff;
            b1 = b >>> 16;
            p01 = imul(a0, b1);
            p10 = imul(a1, b0);
            m = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
            y = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (m >>> 16)) | 0;
            x = ((a + imul(a, b)) | 0) ^ y;
        }
    }
    return finish(x, y);
}

export function hashString(text: string, seedLo: number, seedHi: number): number {
    const n = text.length;
    const byteLength = n * 2;
    let i = 0;
    let x = ((seedLo ^ K4) + byteLength) | 0;
    let y = seedHi ^ K5;
    let a: number, b: number, a0: number, a1: number, b0: number, b1: number;
    let p01: number, p10: number, m: number;
    if (n >= 8) {
        initLanes(scratchLanes, seedLo, seedHi);
        i = stripeString(scratchLanes, text, 0, n);
        a = x ^ scratchLanes[0]!;
        b = y ^ scratchLanes[1]!;
        a0 = a & 0xffff;
        a1 = a >>> 16;
        b0 = b & 0xffff;
        b1 = b >>> 16;
        p01 = imul(a0, b1);
        p10 = imul(a1, b0);
        m = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
        y = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (m >>> 16)) | 0;
        x = ((a + imul(a, b)) | 0) ^ y;
        a = x ^ scratchLanes[2]!;
        b = y ^ scratchLanes[3]!;
        a0 = a & 0xffff;
        a1 = a >>> 16;
        b0 = b & 0xffff;
        b1 = b >>> 16;
        p01 = imul(a0, b1);
        p10 = imul(a1, b0);
        m = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
        y = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (m >>> 16)) | 0;
        x = ((a + imul(a, b)) | 0) ^ y;
    }
    if (i < n) {
        a = x ^ (text.charCodeAt(i) | (text.charCodeAt(i + 1) << 16));
        b = y ^ (text.charCodeAt(i + 2) | (text.charCodeAt(i + 3) << 16));
        a0 = a & 0xffff;
        a1 = a >>> 16;
        b0 = b & 0xffff;
        b1 = b >>> 16;
        p01 = imul(a0, b1);
        p10 = imul(a1, b0);
        m = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
        y = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (m >>> 16)) | 0;
        x = ((a + imul(a, b)) | 0) ^ y;
        if (n - i > 4) {
            a = x ^ (text.charCodeAt(i + 4) | (text.charCodeAt(i + 5) << 16));
            b = y ^ (text.charCodeAt(i + 6) | (text.charCodeAt(i + 7) << 16));
            a0 = a & 0xffff;
            a1 = a >>> 16;
            b0 = b & 0xffff;
            b1 = b >>> 16;
            p01 = imul(a0, b1);
            p10 = imul(a1, b0);
            m = (imul(a0, b0) >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
            y = (b + imul(a1, b1) + (p01 >>> 16) + (p10 >>> 16) + (m >>> 16)) | 0;
            x = ((a + imul(a, b)) | 0) ^ y;
        }
    }
    return finish(x, y);
}
