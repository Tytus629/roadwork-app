import { decodeEfficientDet, decodeYolo, iou, nms, unletterbox } from '../src/detection/decode';
import { distressPenalty, segmentForTime, segmentRating } from '../src/detection/rating';
import { base64ToBytes, bytesToBase64, decodeJpeg, encodeJpeg, letterbox } from '../src/detection/imagePrep';
import { pixelate, redactImage } from '../src/detection/blur';
import { detectionToRow } from '../src/repositories/detectionsRepo';
import { DETECTION_COLUMNS, detectionRow, segmentRow } from '../src/integration/serializers';

describe('segment rating (uncalibrated 1–5)', () => {
  it('null without data; roughness only', () => {
    expect(segmentRating({})).toBeNull();
    expect(segmentRating({ roughnessClass: 'smooth' })).toBe(5);
    expect(segmentRating({ roughnessClass: 'fair' })).toBe(4);
    expect(segmentRating({ roughnessClass: 'very_rough' })).toBe(2);
  });
  it('combines detections, dedups per class, ignores low scores, caps distress', () => {
    const pot = { cls: 'D40' as const, score: 0.9 };
    expect(segmentRating({ roughnessClass: 'smooth', photosChecked: 2, detections: [pot, pot, pot] })).toBe(4); // 5-1.5=3.5→4
    expect(segmentRating({ roughnessClass: 'smooth', photosChecked: 1, detections: [{ cls: 'D40', score: 0.2 }] })).toBe(5);
    expect(distressPenalty([pot, { cls: 'D20', score: 0.9 }, { cls: 'D10', score: 0.9 }, { cls: 'D00', score: 0.9 }])).toBe(2.5);
    expect(segmentRating({ roughnessClass: 'very_rough', photosChecked: 3, detections: [pot, { cls: 'D20', score: 0.8 }] })).toBe(1);
    expect(segmentRating({ photosChecked: 1, detections: [] })).toBe(5);
  });
  it('detections are ignored when no photos were analysed', () => {
    expect(segmentRating({ roughnessClass: 'fair', photosChecked: 0, detections: [{ cls: 'D40', score: 1 }] })).toBe(4);
  });
  it('maps photo time to segment', () => {
    const segs = [{ id: 'a', startedAt: 0, endedAt: 7000 }, { id: 'b', startedAt: 7000, endedAt: 14000 }];
    expect(segmentForTime(segs, 8000)?.id).toBe('b');
    expect(segmentForTime(segs, 20000)?.id).toBe('b');
    expect(segmentForTime(segs, 60000)).toBeNull();
  });
});

describe('detector output decoding', () => {
  it('iou + nms', () => {
    const a = { x: 0, y: 0, w: 1, h: 1 };
    expect(iou(a, a)).toBe(1);
    expect(iou(a, { x: 2, y: 2, w: 1, h: 1 })).toBe(0);
    const d = nms([{ cls: 'D40', score: 0.9, box: a }, { cls: 'D40', score: 0.8, box: { x: 0.05, y: 0, w: 1, h: 1 } }, { cls: 'D00', score: 0.7, box: a }]);
    expect(d.map((x) => `${x.cls}:${x.score}`)).toEqual(['D40:0.9', 'D00:0.7']);
  });
  it('decodes YOLO [1, 4+nc, N] in pixels with letterbox undo', () => {
    const N = 3, nc = 4, size = 640;
    const out = new Float32Array((4 + nc) * N);
    const set = (i: number, v: number[]) => v.forEach((x, c) => (out[c * N + i] = x));
    set(0, [320, 320, 64, 64, 0, 0, 0, 0.9]); // pothole centred
    set(1, [100, 100, 10, 10, 0.1, 0, 0, 0]); // below thresh
    set(2, [320, 320, 60, 60, 0, 0, 0, 0.5]); // duplicate → NMS
    // source 1280x720 → scale 0.5, padY 140
    const lb = { size, scale: 0.5, padX: 0, padY: 140, srcW: 1280, srcH: 720 };
    const d = decodeYolo(out, [1, 4 + nc, N], { inputSize: size, letterbox: lb });
    expect(d).toHaveLength(1);
    expect(d[0].cls).toBe('D40');
    expect(d[0].box.x).toBeCloseTo((288 / 0.5) / 1280, 5);
    expect(d[0].box.y).toBeCloseTo(((288 - 140) / 0.5) / 720, 5);
    expect(d[0].box.w).toBeCloseTo(128 / 1280, 5);
  });
  it('decodes YOLO [1, N, 4+nc] normalized', () => {
    const out = new Float32Array([0.5, 0.5, 0.2, 0.1, 0.8, 0, 0, 0]);
    const d = decodeYolo(out, [1, 1, 8], { inputSize: 320 });
    expect(d[0]).toMatchObject({ cls: 'D00' });
    expect(d[0].box.x).toBeCloseTo(0.4);
  });
  it('decodes EfficientDet-Lite outputs', () => {
    const d = decodeEfficientDet({ boxes: new Float32Array([0.1, 0.2, 0.3, 0.6, 0, 0, 1, 1]), classes: new Float32Array([2, 9]), scores: new Float32Array([0.7, 0.9]), count: 2 }, {});
    expect(d).toHaveLength(1); // class 9 unknown → dropped
    expect(d[0].cls).toBe('D20'); expect(d[0].score).toBeCloseTo(0.7);
    expect(d[0].box.x).toBeCloseTo(0.2); expect(d[0].box.h).toBeCloseTo(0.2);
  });
  it('unletterbox is inverse of letterbox geometry', () => {
    const lb = { size: 320, scale: 0.25, padX: 0, padY: 70, srcW: 1280, srcH: 720 };
    const b = unletterbox({ x: 0, y: 70 / 320, w: 1, h: 180 / 320 }, lb);
    expect(b.x).toBeCloseTo(0); expect(b.y).toBeCloseTo(0); expect(b.w).toBeCloseTo(1); expect(b.h).toBeCloseTo(1);
  });
});

describe('image prep + blur', () => {
  const solid = (w: number, h: number) => {
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { data[i * 4] = (i % w) * 4; data[i * 4 + 1] = 100; data[i * 4 + 2] = 50; data[i * 4 + 3] = 255; }
    return { width: w, height: h, data, channels: 4 as const };
  };
  it('base64 round-trips', () => {
    const b = new Uint8Array([0, 1, 2, 250, 251, 252, 7]);
    expect(Array.from(base64ToBytes(bytesToBase64(b)))).toEqual(Array.from(b));
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe('aGk=');
  });
  it('jpeg encode/decode + letterbox shape', () => {
    const img = solid(64, 32);
    const back = decodeJpeg(encodeJpeg(img, 90));
    expect([back.width, back.height]).toEqual([64, 32]);
    const { tensor, lb } = letterbox(back, 32);
    expect(tensor.length).toBe(32 * 32 * 3);
    expect(lb).toMatchObject({ scale: 0.5, padX: 0, padY: 8 });
    expect(tensor[0]).toBeCloseTo(114 / 255); // padding row
  });
  it('pixelate changes only the box region', () => {
    const img = solid(40, 40);
    const before = img.data.slice();
    pixelate(img, [{ x: 0.5, y: 0.5, w: 0.25, h: 0.25 }], 5, 0);
    expect(img.data[0]).toBe(before[0]); // top-left untouched
    const i = (22 * 40 + 21) * 4;
    expect(img.data[i]).not.toBe(before[i]); // inside box averaged
  });
  it('redact is a no-op without detectors and fails closed on error', async () => {
    expect(await redactImage(solid(4, 4), [])).toEqual({ boxes: [], blurred: false });
    const bad = { name: 'x', detect: async () => { throw new Error('boom'); } };
    expect((await redactImage(solid(4, 4), [bad])).blurred).toBe(false);
  });
});

describe('detection mapping + export', () => {
  const row = detectionToRow({ cls: 'D20', score: 0.87654, box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } },
    { id: 'det1', photoId: 'p1', sessionId: 's1', segmentId: 'seg1', lat: 47.1234567, lng: -122.1, modelName: 'rdd', modelVersion: '1', now: 0 });
  it('maps detection to row', () => {
    expect(row).toMatchObject({ id: 'det1', cls: 'D20', score: 0.877, boxW: 0.3, segmentId: 'seg1' });
  });
  it('exports with screening label and all columns', () => {
    const r = detectionRow(row);
    expect(Object.keys(r).sort()).toEqual([...DETECTION_COLUMNS].sort());
    expect(r).toMatchObject({ DISTRESS_CODE: 'D20', DISTRESS_TYPE: 'ALLIGATOR_CRACK', CONFIDENCE: 0.877, LAT: 47.123457, MODEL: 'rdd@1', DATA_QUALITY: 'UNCALIBRATED_SCREENING' });
  });
  it('segment export carries rating + distress', () => {
    const s = segmentRow({ id: 's', sessionId: 'd', seq: 0, startedAt: 0, endedAt: 1, path: [{ lat: 1, lng: 2 }, { lat: 1.001, lng: 2 }], lengthM: 100, sampleCount: 1, rmsVertical: 1, meanSpeedMps: 13, roughnessIndex: 1, roughnessClass: 'fair' }, null, { rating: 3, distress: ['D40', 'D00', 'D40'], photosAnalysed: 2 });
    expect(s).toMatchObject({ SCREEN_RATING_1_5: 3, DETECTED_DISTRESS: 'D00;D40', PHOTOS_ANALYSED: 2 });
  });
});
