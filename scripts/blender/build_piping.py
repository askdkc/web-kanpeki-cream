"""Bake the open-star piping profile from a cyclic Blender Bezier curve."""
from math import cos, sin, tau
from pathlib import Path
import json
import bpy

curve = bpy.data.curves.new("Eight-flute French star", "CURVE")
curve.dimensions = "2D"
curve.resolution_u = 4
spline = curve.splines.new("BEZIER")
spline.bezier_points.add(15)
for i, point in enumerate(spline.bezier_points):
    angle = i * tau / 16
    radius = 1 if i % 2 == 0 else 0.56
    point.co = (radius * cos(angle), radius * sin(angle), 0)
    point.handle_left_type = point.handle_right_type = "AUTO"
    # Short handles round the crests while retaining the folds between them.
    tangent = (-sin(angle), cos(angle), 0)
    length = 0.085 if i % 2 == 0 else 0.11
    point.handle_left_type = point.handle_right_type = "FREE"
    point.handle_left = tuple(point.co[k] - length * tangent[k] for k in range(3))
    point.handle_right = tuple(point.co[k] + length * tangent[k] for k in range(3))
spline.use_cyclic_u = True
die = bpy.data.objects.new("Whipped cream die", curve)
bpy.context.collection.objects.link(die)
evaluated = die.evaluated_get(bpy.context.evaluated_depsgraph_get())
mesh = evaluated.to_mesh()
outline = [[round(v.co.x, 5), round(v.co.y, 5)] for v in mesh.vertices]
assert len(outline) == 64
path = Path(__file__).with_name("piping-profile.json")
path.write_text(json.dumps(outline, separators=(",", ":")) + "\n")
evaluated.to_mesh_clear()
