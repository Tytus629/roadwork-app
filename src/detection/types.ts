/** Road damage classes from RDD2022 / CRDDC'2022 (4-class taxonomy). */
export type DamageClass = "D00" | "D10" | "D20" | "D40";
export const DAMAGE_CLASSES: DamageClass[] = ["D00", "D10", "D20", "D40"];
export const DAMAGE_LABELS: Record<DamageClass, string> = {
  D00: "Longitudinal crack",
  D10: "Transverse crack",
  D20: "Alligator crack",
  D40: "Pothole",
};
/** Normalized [0..1] box in ORIGINAL image coordinates. */
export type Box = { x: number; y: number; w: number; h: number };
export type Detection = { cls: DamageClass; score: number; box: Box };

/** Pluggable detector: anything that maps an RGB image to detections. */
export interface RoadDamageDetector {
  readonly name: string;
  readonly version: string;
  detect(img: RgbImage): Promise<Detection[]>;
}

export type RgbImage = { width: number; height: number; data: Uint8Array }; // RGBA or RGB, see channels
export type RgbaImage = RgbImage & { channels: 4 };
