#!/usr/bin/env python3
"""Convert RDD2022 Pascal-VOC annotations to YOLO or COCO, keeping only D00/D10/D20/D40.

Usage: prepare_rdd2022.py --src RDD2022/United_States/train --out data/us --format yolo --val 0.15
Expects <src>/images/*.jpg and <src>/annotations/xmls/*.xml (RDD2022 layout).
Stdlib only.
"""
import argparse, json, random, shutil, xml.etree.ElementTree as ET
from pathlib import Path

CLASSES = ["D00", "D10", "D20", "D40"]

def parse(xml_path):
    r = ET.parse(xml_path).getroot()
    size = r.find("size")
    w, h = int(float(size.findtext("width"))), int(float(size.findtext("height")))
    objs = []
    for o in r.findall("object"):
        name = (o.findtext("name") or "").strip()
        if name not in CLASSES:
            continue
        b = o.find("bndbox")
        x1, y1, x2, y2 = (float(b.findtext(k)) for k in ("xmin", "ymin", "xmax", "ymax"))
        x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
        if x2 > x1 and y2 > y1:
            objs.append((CLASSES.index(name), x1, y1, x2, y2))
    return w, h, objs

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--format", choices=["yolo", "coco"], default="yolo")
    ap.add_argument("--val", type=float, default=0.15); ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--keep-empty", action="store_true", help="keep images with no D00-D40 labels as negatives")
    a = ap.parse_args()
    src, out = Path(a.src), Path(a.out)
    xmls = sorted((src / "annotations" / "xmls").glob("*.xml"))
    random.Random(a.seed).shuffle(xmls)
    n_val = int(len(xmls) * a.val)
    splits = {"val": xmls[:n_val], "train": xmls[n_val:]}
    stats = {"images": 0, "boxes": {c: 0 for c in CLASSES}}
    for split, files in splits.items():
        coco = {"images": [], "annotations": [], "categories": [{"id": i, "name": c} for i, c in enumerate(CLASSES)]}
        img_dir = out / split / "images"; img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir = out / split / "labels"
        if a.format == "yolo":
            lbl_dir.mkdir(parents=True, exist_ok=True)
        for x in files:
            w, h, objs = parse(x)
            if not objs and not a.keep_empty:
                continue
            img = src / "images" / (x.stem + ".jpg")
            if not img.exists():
                continue
            shutil.copy2(img, img_dir / img.name)
            stats["images"] += 1
            for o in objs:
                stats["boxes"][CLASSES[o[0]]] += 1
            if a.format == "yolo":
                lines = [f"{c} {((x1+x2)/2)/w:.6f} {((y1+y2)/2)/h:.6f} {(x2-x1)/w:.6f} {(y2-y1)/h:.6f}" for c, x1, y1, x2, y2 in objs]
                (lbl_dir / (x.stem + ".txt")).write_text("\n".join(lines) + ("\n" if lines else ""))
            else:
                iid = len(coco["images"]) + 1
                coco["images"].append({"id": iid, "file_name": img.name, "width": w, "height": h})
                for c, x1, y1, x2, y2 in objs:
                    coco["annotations"].append({"id": len(coco["annotations"]) + 1, "image_id": iid, "category_id": c,
                                                "bbox": [x1, y1, x2 - x1, y2 - y1], "area": (x2 - x1) * (y2 - y1), "iscrowd": 0})
        if a.format == "coco":
            (out / split / "labels.json").write_text(json.dumps(coco))
    if a.format == "yolo":
        (out / "data.yaml").write_text(
            f"path: {out.resolve()}\ntrain: train/images\nval: val/images\nnames:\n" + "".join(f"  {i}: {c}\n" for i, c in enumerate(CLASSES)))
    (out / "ATTRIBUTION.txt").write_text(
        "Derived from RDD2022 (Arya et al., 2024, Geoscience Data Journal; figshare 10.6084/m9.figshare.21431547), CC BY-SA 4.0.\n")
    print(json.dumps(stats))

if __name__ == "__main__":
    main()
