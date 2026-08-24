import hashlib
import json
import sys
from pathlib import Path


ARTIFACTS = Path("audit_artifacts/autogloss-scratch-pilot-20260824")
rank = int(sys.argv[1])
decision_file = json.loads((ARTIFACTS / "decisions.json").read_text())
geometry_file = json.loads((ARTIFACTS / "roster_with_geometry.json").read_text())
decision_row = next(row for row in decision_file["images"] if row["rank"] == rank)
geometry_row = next(row for row in geometry_file if row["rank"] == rank)
geometry_by_index = {
    row["local_index"]: row for row in geometry_row["export_annotations"]
}

category_ids = {
    "dent": 1,
    "scratch_scuff": 2,
    "paint_damage": 3,
    "crack": 4,
    "lamp_damage": 5,
    "damage": 6,
}
annotations = []
counts = {name: 0 for name in category_ids}
geometry_blob = []
for decision in decision_row["decisions"]:
    local_index = decision["local_index"]
    source = geometry_by_index[local_index]
    geometry_blob.append(source["segmentation"])
    action = decision["action"]
    if action == "excluded":
        continue
    class_name = "damage" if action == "unresolved" else action
    counts[class_name] += 1
    annotations.append(
        {
            "id": local_index,
            "image_id": 1,
            "category_id": category_ids[class_name],
            "segmentation": source["segmentation"],
            "area": source["area"],
            "bbox": source["bbox"],
            "iscrowd": 0,
        }
    )

content = {
    "images": [
        {
            "id": 1,
            "file_name": decision_row["filename"],
            "width": 640,
            "height": 640,
        }
    ],
    "annotations": annotations,
    "categories": [
        {
            "id": category_id,
            "name": name,
            "supercategory": "vehicle-damage",
        }
        for name, category_id in category_ids.items()
    ],
}
decisions = ",".join(
    f'{decision["local_index"]}:{decision["action"]}'
    for decision in decision_row["decisions"]
)
geometry_sha256 = hashlib.sha256(
    json.dumps(geometry_blob, separators=(",", ":")).encode()
).hexdigest()
result = {
    "rank": rank,
    "id": decision_row["id"],
    "filename": decision_row["filename"],
    "annotation_name": decision_row["filename"] + ".coco.json",
    "annotation_content": json.dumps(content, separators=(",", ":")),
    "expected_counts": {
        class_name: count for class_name, count in counts.items() if count
    },
    "reviewed_count": len(decision_row["decisions"]),
    "excluded_count": sum(
        decision["action"] == "excluded"
        for decision in decision_row["decisions"]
    ),
    "unresolved_count": sum(
        decision["action"] == "unresolved"
        for decision in decision_row["decisions"]
    ),
    "decisions": decisions,
    "geometry_sha256": geometry_sha256,
    "frozen_ids": ",".join(
        str(annotation["export_annotation_id"])
        for annotation in geometry_row["export_annotations"]
    ),
}
print(json.dumps(result, separators=(",", ":")))
