#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/blender/render_previews.py

public/models/*.glb を読み込み、スタジオ照明でプレビューを書き出す。
品質確認用（ゲーム本体は GLB をそのまま読む）。

実行:
  Blender -b -P scripts/blender/render_previews.py
  Blender -b -P scripts/blender/render_previews.py -- --samples 48 --res 512
"""

import glob
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
GLB_DIR = os.path.join(ROOT, "public", "models")
OUT_DIR = os.path.join(ROOT, "shots3d", "models")

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default):
    if name in ARGS:
        return ARGS[ARGS.index(name) + 1]
    return default


SAMPLES = int(arg("--samples", "48"))
RES = int(arg("--res", "512"))
ONLY = arg("--only", "")


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.device = "CPU"
    scene.render.resolution_x = RES
    scene.render.resolution_y = RES
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"


def world(color=(0.42, 0.70, 0.46), strength=0.32):
    w = bpy.data.worlds.new("W")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (*color, 1.0)
    bg.inputs[1].default_value = strength


def lights():
    # キー（上から手前）
    key = bpy.data.lights.new("key", type="AREA")
    key.energy = 160.0
    key.size = 3.2
    ko = bpy.data.objects.new("key", key)
    ko.location = (-2.2, -2.6, 4.2)
    ko.rotation_euler = Euler((math.radians(38), 0.0, math.radians(-40)), "XYZ")
    bpy.context.scene.collection.objects.link(ko)

    # フィル（反対側）
    fill = bpy.data.lights.new("fill", type="AREA")
    fill.energy = 55.0
    fill.size = 4.0
    fo = bpy.data.objects.new("fill", fill)
    fo.location = (3.2, -2.0, 2.4)
    fo.rotation_euler = Euler((math.radians(62), 0.0, math.radians(58)), "XYZ")
    bpy.context.scene.collection.objects.link(fo)

    # リム（後方）
    rim = bpy.data.lights.new("rim", type="AREA")
    rim.energy = 70.0
    rim.size = 2.4
    ro = bpy.data.objects.new("rim", rim)
    ro.location = (1.2, 3.4, 3.0)
    ro.rotation_euler = Euler((math.radians(118), 0.0, math.radians(18)), "XYZ")
    bpy.context.scene.collection.objects.link(ro)


def backdrop():
    # 地面（淡い緑）とカーブした背景
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    plane = bpy.context.object
    m = bpy.data.materials.new("backdrop")
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.30, 0.66, 0.34, 1)
    bsdf.inputs["Roughness"].default_value = 0.85
    plane.data.materials.append(m)

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 7.0, 0))
    wall = bpy.context.object
    wall.rotation_euler = Euler((math.radians(90), 0.0, 0.0), "XYZ")
    m2 = bpy.data.materials.new("wall")
    m2.use_nodes = True
    b2 = m2.node_tree.nodes["Principled BSDF"]
    b2.inputs["Base Color"].default_value = (0.36, 0.74, 0.40, 1)
    b2.inputs["Roughness"].default_value = 1.0
    b2.inputs["Emission Color"].default_value = (0.36, 0.74, 0.40, 1)
    b2.inputs["Emission Strength"].default_value = 0.08
    wall.data.materials.append(m2)


def camera_for(obj):
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    zs = [v.z for v in bb]
    xs = [v.x for v in bb]
    ys = [v.y for v in bb]
    center = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))
    size = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs), 0.6)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 62
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    dist = size * 2.5 + 1.4
    cam.location = Vector((center.x - dist * 0.42, center.y - dist * 0.86, center.z + dist * 0.62))
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if not new:
        raise RuntimeError("メッシュが無い: %s" % path)
    # 1つのオブジェクトにまとめる
    bpy.ops.object.select_all(action="DESELECT")
    for o in new:
        o.select_set(True)
    bpy.context.view_layer.objects.active = new[0]
    if len(new) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = os.path.basename(path)
    # glTF は Z-up に戻る（Blender 内）。そのまま使う。
    return obj


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    files = sorted(glob.glob(os.path.join(GLB_DIR, "*.glb")))
    for path in files:
        sid = os.path.splitext(os.path.basename(path))[0]
        if ONLY and ONLY != sid:
            continue
        clear()
        world()
        lights()
        backdrop()
        obj = import_glb(path)
        camera_for(obj)
        out = os.path.join(OUT_DIR, "%s.png" % sid)
        bpy.context.scene.render.filepath = out
        bpy.context.scene.render.image_settings.file_format = "PNG"
        bpy.ops.render.render(write_still=True)
        print("[render] %s -> %s" % (sid, out))


main()
