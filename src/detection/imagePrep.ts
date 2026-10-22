/* eslint-disable no-bitwise */
/** imagePrep.ts — pure JPEG decode (jpeg-js, BSD-3) + letterbox resize for model input. */
import jpeg from "jpeg-js";
import type { RgbaImage } from "./types";

export type Letterbox = { size: number; scale: number; padX: number; padY: number; srcW: number; srcH: number };

export function base64ToBytes(b64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lut = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lut[chars.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lut[clean.charCodeAt(i)], b = lut[clean.charCodeAt(i + 1)];
    const c = lut[clean.charCodeAt(i + 2)], d = lut[clean.charCodeAt(i + 3)];
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let s = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    s += chars[a >> 2] + chars[((a & 3) << 4) | (b >> 4)];
    s += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : "=";
    s += i + 2 < bytes.length ? chars[c & 63] : "=";
  }
  return s;
}

export function decodeJpeg(bytes: Uint8Array): RgbaImage {
  const r = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
  return { width: r.width, height: r.height, data: r.data as Uint8Array, channels: 4 };
}
export function encodeJpeg(img: RgbaImage, quality = 80): Uint8Array {
  return jpeg.encode({ width: img.width, height: img.height, data: img.data }, quality).data as Uint8Array;
}

/** Nearest-neighbour letterbox to size×size RGB; pad value 114 (YOLO convention). */
export function letterbox(img: RgbaImage, size: number, as: "float32" | "uint8" = "float32"): { tensor: Float32Array | Uint8Array; lb: Letterbox } {
  const scale = Math.min(size / img.width, size / img.height);
  const nw = Math.round(img.width * scale), nh = Math.round(img.height * scale);
  const padX = Math.floor((size - nw) / 2), padY = Math.floor((size - nh) / 2);
  const t = as === "float32" ? new Float32Array(size * size * 3).fill(114 / 255) : new Uint8Array(size * size * 3).fill(114);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y / scale));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / scale));
      const si = (sy * img.width + sx) * 4;
      const di = ((y + padY) * size + (x + padX)) * 3;
      for (let c = 0; c < 3; c++) t[di + c] = as === "float32" ? img.data[si + c] / 255 : img.data[si + c];
    }
  }
  return { tensor: t, lb: { size, scale, padX, padY, srcW: img.width, srcH: img.height } };
}
