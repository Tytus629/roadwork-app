#!/usr/bin/env python3
"""Synthetic smoke test for prepare_rdd2022.py (stdlib only, no downloads)."""
import json, subprocess, sys, tempfile
from pathlib import Path

XML = """<annotation><size><width>600</width><height>600</height></size>
<object><name>D40</name><bndbox><xmin>100</xmin><ymin>200</ymin><xmax>300</xmax><ymax>400</ymax></bndbox></object>
<object><name>D44</name><bndbox><xmin>1</xmin><ymin>1</ymin><xmax>5</xmax><ymax>5</ymax></bndbox></object>
<object><name>D00</name><bndbox><xmin>0</xmin><ymin>0</ymin><xmax>700</xmax><ymax>60</ymax></bndbox></object>
</annotation>"""

def main():
    here = Path(__file__).parent
    with tempfile.TemporaryDirectory() as t:
        src = Path(t, "src"); (src / "images").mkdir(parents=True); (src / "annotations" / "xmls").mkdir(parents=True)
        for i in range(4):
            (src / "annotations" / "xmls" / f"img{i}.xml").write_text(XML)
            (src / "images" / f"img{i}.jpg").write_bytes(b"\xff\xd8\xff\xd9")
        for fmt in ("yolo", "coco"):
            out = Path(t, fmt)
            r = subprocess.run([sys.executable, str(here / "prepare_rdd2022.py"), "--src", str(src), "--out", str(out), "--format", fmt, "--val", "0.25"], capture_output=True, text=True, check=True)
            stats = json.loads(r.stdout.strip().splitlines()[-1])
            assert stats["images"] == 4 and stats["boxes"] == {"D00": 4, "D10": 0, "D20": 0, "D40": 4}, stats
            if fmt == "yolo":
                lbl = next((out / "train" / "labels").glob("*.txt")).read_text().split("\n")[0].split()
                assert lbl[0] == "3" and abs(float(lbl[1]) - 200 / 600) < 1e-6 and abs(float(lbl[3]) - 200 / 600) < 1e-6, lbl
                assert "3: D40" in (out / "data.yaml").read_text()
            else:
                coco = json.loads((out / "train" / "labels.json").read_text())
                assert coco["annotations"][0]["bbox"] == [100.0, 200.0, 200.0, 200.0], coco["annotations"][0]
                assert coco["annotations"][1]["bbox"][2] == 600.0  # clipped
            assert "CC BY-SA 4.0" in (out / "ATTRIBUTION.txt").read_text()
    print("SMOKE OK")

if __name__ == "__main__":
    main()
