import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path("/tmp/autogloss-dent-pilot-20260823/source-v2-coco")
ARTIFACTS = Path("audit_artifacts/autogloss-scratch-pilot-20260824")
OUT = ARTIFACTS / "rendered"
OUT.mkdir(parents=True, exist_ok=True)
roster = json.loads((ARTIFACTS / "roster.json").read_text())

index = {}
for split in ("train", "valid", "test"):
    data = json.loads((ROOT / split / "_annotations.coco.json").read_text())
    categories = {category["id"]: category["name"] for category in data["categories"]}
    annotations = {}
    for annotation in data["annotations"]:
        annotations.setdefault(annotation["image_id"], []).append(annotation)
    for image in data["images"]:
        index[image["file_name"]] = (
            split,
            image,
            annotations.get(image["id"], []),
            categories,
        )

font = ImageFont.load_default()
records = []
tiles = []
for item in roster:
    export_name = item["user_metadata"]["frozen_v2_export_filename"]
    if export_name not in index:
        raise RuntimeError(f"missing export file {export_name}")
    split, image_meta, annotations, categories = index[export_name]
    if len(annotations) != item["damage_count"]:
        raise RuntimeError(
            f'count mismatch {item["id"]}: '
            f'export={len(annotations)} live={item["damage_count"]}'
        )
    if any(categories[a["category_id"]] != "damage" for a in annotations):
        raise RuntimeError(f'unexpected source class {item["id"]}')

    image = Image.open(ROOT / split / export_name).convert("RGBA")
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    annotation_records = []
    for local_index, annotation in enumerate(
        sorted(annotations, key=lambda value: value["id"]), 1
    ):
        for polygon in annotation.get("segmentation", []):
            points = [
                (polygon[index], polygon[index + 1])
                for index in range(0, len(polygon), 2)
            ]
            if len(points) >= 3:
                draw.polygon(
                    points,
                    fill=(255, 0, 0, 76),
                    outline=(255, 255, 0, 255),
                    width=3,
                )
        x, y, width, height = annotation["bbox"]
        label = f'{item["rank"]}.{local_index}'
        draw.rectangle(
            (x, y, x + max(34, len(label) * 7), y + 16),
            fill=(0, 0, 0, 220),
        )
        draw.text((x + 2, y + 2), label, font=font, fill=(255, 255, 0, 255))
        annotation_records.append(
            {
                "local_index": local_index,
                "export_annotation_id": annotation["id"],
                "area": annotation.get("area"),
                "bbox": annotation.get("bbox"),
                "segmentation": annotation.get("segmentation"),
            }
        )

    rendered = Image.alpha_composite(image, layer).convert("RGB")
    header = Image.new("RGB", (640, 42), "white")
    header_draw = ImageDraw.Draw(header)
    header_draw.text(
        (6, 4),
        f'R{item["rank"]} {item["id"]} masks={len(annotations)}',
        font=font,
        fill="black",
    )
    header_draw.text((6, 21), item["filename"][:88], font=font, fill="black")
    tile = Image.new("RGB", (640, 682), "white")
    tile.paste(header, (0, 0))
    tile.paste(rendered, (0, 42))
    tile.save(OUT / f'rank-{item["rank"]:03d}.jpg', quality=94)
    tiles.append((item["rank"], tile))
    records.append(
        {
            **item,
            "export_split": split,
            "export_image_id": image_meta["id"],
            "export_annotation_count": len(annotations),
            "export_annotations": annotation_records,
        }
    )

for start in range(0, len(tiles), 4):
    sheet = Image.new("RGB", (1280, 1364), (225, 225, 225))
    for offset, (_, tile) in enumerate(tiles[start : start + 4]):
        sheet.paste(tile, ((offset % 2) * 640, (offset // 2) * 682))
    sheet.save(
        OUT
        / f"sheet-{start // 4 + 1:02d}-r{start + 1:03d}-"
        f"r{min(start + 4, len(tiles)):03d}.jpg",
        quality=92,
    )

(ARTIFACTS / "roster_with_geometry.json").write_text(
    json.dumps(records, indent=2) + "\n"
)
print(
    json.dumps(
        {
            "images": len(records),
            "masks": sum(record["export_annotation_count"] for record in records),
            "sheets": (len(records) + 3) // 4,
        },
        indent=2,
    )
)
