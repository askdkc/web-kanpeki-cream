"""Sample the actual baked GLBs along the dispenser lane. Run after build_sweets.py."""
import json
from pathlib import Path

import bpy
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]


def measure(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    vertices, faces = [], []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        offset = len(vertices)
        vertices.extend(obj.matrix_world @ v.co for v in obj.data.vertices)
        faces.extend([v + offset for v in p.vertices] for p in obj.data.polygons)
    tree = BVHTree.FromPolygons(vertices, faces)
    half_x = min(-min(v.x for v in vertices), max(v.x for v in vertices)) * 0.96
    half_z = max(abs(v.y) for v in vertices)

    def top(x, y):
        hit = tree.ray_cast((x, y, 5), (0, 0, -1))[0]
        return hit.z if hit else None

    rows = []
    for i in range(65):
        x = half_x * (i / 32 - 1)
        height = top(x, 0)
        width = 0
        if height is not None:
            for j in range(1, 65):
                y = j * half_z / 64
                if top(x, y) is None or top(x, -y) is None:
                    break
                width = y
        rows.append([round(width * 0.94, 4), round(height or 0, 4)])
    return dict(halfX=round(half_x, 4), halfZ=round(half_z, 4), rows=rows)


surfaces = {p.stem: measure(p) for p in sorted((ROOT / "public/models").glob("*.glb"))}
Path(__file__).with_name("icing-surfaces.json").write_text(json.dumps(surfaces, separators=(",", ":"))+"\n")
