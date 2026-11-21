#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""scripts/blender/build_sweets.py

ゲームに登場する焼き菓子と果物をヘッドレスBlenderで組み立て、
public/models/<id>.glb と scripts/blender/models.json を書き出す。

実行:
  Blender -b -P scripts/blender/build_sweets.py
  （.tools/blender/Blender.app/Contents/MacOS/Blender -b -P scripts/blender/build_sweets.py）

出力仕様:
  * 原点 = 底面の中心、上方向 = Y（glTF標準のY-up。Blender内はZ-upで組んで書き出し時に変換）
  * 水平方向の最大半径を 1.0 に正規化し、底面を y=0 に接地させる（一様スケール）
  * Principled BSDF のパステル調マテリアル（低ラフネスでツヤを出す）をGLBに埋め込む
  * 1モデルあたり 3000 三角形以下
  * creamY はクリーム（トッピング）が乗る上面の高さを、正規化後の座標系で出力

造形方針:
  回転体（revolve）と押し出し（prism）だけで構成する。面数は回転の分割数で決まるため、
  見た目に必要な最小限の分割数を各部品ごとに指定して 3000 tris の予算に収める。
"""

import json
import math
import os

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

TAU = math.tau
MAX_TRIS = 3000

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
GLB_DIR = os.path.join(ROOT, "public", "models")
JSON_PATH = os.path.join(SCRIPT_DIR, "models.json")


# ---------------------------------------------------------------------------
# マテリアル（パステル調・明るめ・ツヤあり）
#   key: (sRGB hex, roughness, metallic)
#   roughness を 0.10〜0.55 に置くことで、Principled BSDF の鏡面反射でツヤを出す。
# ---------------------------------------------------------------------------

PALETTE = {
    "grape_skin": ("#693f8c", 0.29, 0),
    "grape_stem": ("#857a4a", 0.68, 0),
    "raspberry_skin": ("#d73154", 0.35, 0),
    "paper_rose": ("#ea8da3", 0.62, 0),
    "muffin": ("#ce914f", 0.71, 0),
    "blueberry_skin": ("#464382", 0.32, 0),
    "berry_bloom": ("#342649", 0.51, 0),
    "crumble": ("#e9bd7c", 0.68, 0),
    "brioche": ("#df9855", 0.63, 0),
    "raspberry_glaze": ("#fa729f", 0.19, 0),
    "pistachio": ("#709646", 0.58, 0),
    "almond_shell": ("#eda1b8", 0.54, 0),
    "macaron_foot": ("#ce788b", 0.66, 0),
    "berry_jam": ("#bb254d", 0.21, 0),
    "tart_floor": ("#ecb76e", 0.66, 0),
    "biscuit": ("#d49c58", 0.69, 0),
    "peach": ("#ffae53", 0.27, 0),
    "waffle_rim": ("#edb451", 0.58, 0),
    "waffle_pocket": ("#c18339", 0.64, 0),
    "cookie_crumb": ("#c89158", 0.76, 0),
    "dark_chip": ("#54302a", 0.36, 0),
    "crystal": ("#d2eeef", 0.16, 0),
    "griddle": ("#c48b4a", 0.62, 0),
    "maple": ("#a7652b", 0.19, 0),
    "choux": ("#d38c44", 0.69, 0),
    "ganache": ("#53271e", 0.24, 0),
    "caramel_line": ("#dfae79", 0.42, 0),
    "sponge": ("#f7cf8c", 0.85, 0),
    "strawberry_skin": ("#e5263e", 0.31, 0),
    "berry_flesh": ("#ff6c73", 0.55, 0),
    "paper":        ("#f9d2ad", 0.48, 0.0),   # カップケーキの紙
    "paper_light":  ("#ffe6cf", 0.50, 0.0),
    "cake":         ("#f8d9ab", 0.62, 0.0),   # 焼き菓子の生地
    "cake_deep":    ("#eec089", 0.62, 0.0),
    "cream":        ("#fff8ee", 0.30, 0.0),   # ホイップ
    "cream_pink":   ("#ffdce8", 0.28, 0.0),
    "cream_yellow": ("#fff4cf", 0.28, 0.0),
    "cherry":       ("#f2697f", 0.13, 0.0),
    "dough":        ("#e8b57c", 0.55, 0.0),
    "toast":        ("#d39a5c", 0.58, 0.0),
    "glaze_pink":   ("#ffa8cb", 0.14, 0.0),
    "macaron_shell": ("#ffc2d6", 0.30, 0.0),
    "macaron_top":  ("#ffd5e3", 0.30, 0.0),
    "filling":      ("#fff3e4", 0.42, 0.0),
    "crust":        ("#f0c288", 0.52, 0.0),
    "crust_deep":   ("#e2ab6c", 0.55, 0.0),
    "custard":      ("#ffdf9e", 0.24, 0.0),
    "fruit_red":    ("#ee5b74", 0.16, 0.0),
    "fruit_purple": ("#b9a3ea", 0.16, 0.0),
    "fruit_orange": ("#f9c07c", 0.16, 0.0),
    "fruit_green":  ("#b9e08a", 0.16, 0.0),
    "mint":         ("#7fcb96", 0.42, 0.0),
    "choco":        ("#7a5238", 0.16, 0.0),
    "eclair_body":  ("#f0c894", 0.55, 0.0),
    "syrup":        ("#f5ad45", 0.10, 0.0),
    "butter":       ("#fff6c2", 0.26, 0.0),
    "pancake_a":    ("#f7d5a3", 0.55, 0.0),
    "pancake_b":    ("#f1c894", 0.55, 0.0),
    "pancake_c":    ("#fadcaf", 0.55, 0.0),
    "cookie":       ("#e6b577", 0.55, 0.0),
    "chip":         ("#7a5238", 0.34, 0.0),
    "glass":        ("#eaf8ff", 0.10, 0.0),   # パフェの器（不透明のパステルブルー）
    "glass_rim":    ("#ffffff", 0.08, 0.0),
    "layer_pink":   ("#ffc9df", 0.30, 0.0),
    "layer_cream":  ("#fff5da", 0.30, 0.0),
    "layer_lilac":  ("#d8bcf0", 0.30, 0.0),
    "layer_coral":  ("#ffbfa8", 0.30, 0.0),
    "berry":        ("#f1506c", 0.14, 0.0),
    "seed":         ("#ffeeb0", 0.40, 0.0),
    "leaf":         ("#6fbf82", 0.40, 0.0),
    "white":        ("#ffffff", 0.10, 0.0),
    "sprinkle_a":   ("#fff2b0", 0.30, 0.0),
    "sprinkle_b":   ("#b6ecd8", 0.30, 0.0),
    "sprinkle_c":   ("#c6dcff", 0.30, 0.0),
}


def _srgb_to_linear(c):
    """sRGB(0-255) を Blender 内部のリニア値へ。GLB の baseColorFactor もリニア格納。"""
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _hex_linear(h):
    h = h.lstrip("#")
    return tuple(_srgb_to_linear(int(h[i:i + 2], 16)) for i in (0, 2, 4))


CRUMB_MATERIALS = {"choux", "sponge", "muffin", "brioche", "macaron_foot", "biscuit", "cookie_crumb", "griddle", "waffle_pocket"}


def baked_crumb(material, key):
    """Pack a small tile of baked colour into the GLB; no runtime noise shader."""
    import numpy as np
    size = 192
    rng = np.random.default_rng(29 if key == "sponge" else 71)
    yy, xx = np.mgrid[:size, :size]
    grain = rng.normal(0, 0.026, (size, size))
    grain += 0.07*np.sin(TAU*xx/size*3 + np.sin(TAU*yy/size*2))
    for _ in range(440 if key == "sponge" else 180):
        cx, cy = rng.uniform(0, size, 2)
        dx = (xx-cx+size/2)%size-size/2
        dy = (yy-cy+size/2)%size-size/2
        r = rng.uniform(0.9, 3.6)
        d = (dx/(r*(1.2 if key == "sponge" else 3.2)))**2 + (dy/r)**2
        grain -= rng.uniform(0.14, 0.40)*np.exp(-d*1.7)
        grain += 0.07*np.exp(-((d-1.2)/0.42)**2)
    base = np.array(list(bytes.fromhex(PALETTE[key][0][1:]))) / 255
    pixels = np.ones((size,size,4),dtype=np.float32)
    pixels[:,:,:3] = np.clip(base*(1+grain[:,:,None]*np.array([0.9,1.3,1.8])),0,1)
    pack_albedo(material, key, pixels)


def berry_cut(material):
    import numpy as np
    y,x = np.mgrid[-1:1:96j,-1:1:96j]
    radius = np.sqrt(x*x + (y*0.92)**2)
    edge = np.clip((radius-0.73)*4,0,1)
    core = np.exp(-((x/(0.18+0.13*(y+1)))**2 + ((y-0.14)/0.63)**2))
    veins = (0.5+0.5*np.cos(29*np.arctan2(y-0.45,x)+2.5*radius))**9
    light = np.minimum(0.85,core*0.79+0.18*veins*(1-edge))
    flesh = np.array([0.98,0.36,0.40])
    red = np.array([0.86,0.09,0.16])
    ivory = np.array([1,0.85,0.73])
    rgb = flesh+(red-flesh)*edge[:,:,None]
    pixels = np.ones((96,96,4),dtype=np.float32)
    pixels[:,:,:3] = rgb+(ivory-rgb)*light[:,:,None]
    pack_albedo(material, "Cut strawberry", pixels)


def pack_albedo(material, key, pixels):
    size = pixels.shape[0]
    img = bpy.data.images.new(key,width=size,height=size,alpha=False)
    img.pixels.foreach_set(pixels.ravel())
    img.pack()
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    material.node_tree.links.new(node.outputs["Color"],material.node_tree.nodes["Principled BSDF"].inputs["Base Color"])


def pastry_uv(mesh, keys):
    uv = mesh.uv_layers.new(name="PastryUV")
    for face in mesh.polygons:
        axis = max(range(3),key=lambda i: abs(face.normal[i]))
        if keys[face.material_index] == "berry_flesh":
            points = [mesh.vertices[v].co for v in face.vertices]
            xs, zs = [p.x for p in points], [p.z for p in points]
            for i in face.loop_indices:
                p = mesh.vertices[mesh.loops[i].vertex_index].co
                uv.data[i].uv = ((p.x-min(xs))/(max(xs)-min(xs)), (p.z-min(zs))/(max(zs)-min(zs)))
            continue
        for i in face.loop_indices:
            p = mesh.vertices[mesh.loops[i].vertex_index].co
            u,v = [(p.y,p.z),(p.x,p.z),(p.x,p.y)][axis]
            uv.data[i].uv = (u*1.7,v*1.7)


def make_material(key):
    hexcol, rough, metal = PALETTE[key]
    rgb = _hex_linear(hexcol)
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf is None:
        raise RuntimeError("Principled BSDF ノードが見つからない: %s" % key)
    bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    # ツヤ（スペキュラ）を明示。入力名はバージョンで揺れるので存在時のみ設定。
    for name, value in (("Specular IOR Level", 0.6), ("IOR", 1.45)):
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = value

    # 頂点カラー（焼いた陰影）は COLOR_0 として書き出され、glTF / Babylon の
    # PBR が baseColorFactor に乗算する。ここでは Base Color を素の色のまま残す。
    mat.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    if key in CRUMB_MATERIALS:
        baked_crumb(mat, key)
    elif key == "berry_flesh":
        berry_cut(mat)
    return mat


def bake_shading(obj, mesh, strength=0.62):
    """パーツ間の遮蔽を頂点カラーへ焼く（簡易 AO）。

    レイキャストで自分自身との交差までの距離を測り、近いほど暗くする。
    凹み・隙間・接地部が沈み、平坦なプラスチック感が減る。
    """
    if "Col" in mesh.color_attributes:
        mesh.color_attributes.remove(mesh.color_attributes["Col"])
    layer = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")

    # BVH を一度だけ構築する
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())

    normals = [(v.normal.copy() if v.normal.length > 1e-6 else Vector((0, 0, 1))) for v in mesh.vertices]
    radius = 0.42
    for i, v in enumerate(mesh.vertices):
        n = normals[i]
        origin = v.co + n * 0.004
        hit = bvh.ray_cast(origin, n, radius)
        if hit[0] is None:
            occ = 1.0
        else:
            dist = hit[3]
            occ = 0.35 + 0.65 * min(1.0, dist / radius)
        # 真下（接地面）を少し暗くして接地感を出す
        down = max(0.0, -n.z)
        occ *= 1.0 - 0.18 * down
        shade = 1.0 - strength * (1.0 - occ)
        layer.data[i].color = (shade, shade, shade, 1.0)

    mesh.color_attributes.active_color = layer
    mesh.color_attributes.render_color_index = mesh.color_attributes.find("Col")


# ---------------------------------------------------------------------------
# 形状ジェネレータ（すべて (verts, faces) のリストを返す。座標は Z-up・ローカル）
# ---------------------------------------------------------------------------


def revolve(profile, seg=32, closed=False, cap_bottom=False, cap_top=False):
    """Z軸まわりの回転体。profile は (半径, z) の列。半径0の点は極として1頂点に潰す。"""
    verts, faces, rings = [], [], []
    for r, z in profile:
        if abs(r) < 1e-6:
            rings.append(("pole", len(verts)))
            verts.append((0.0, 0.0, z))
        else:
            base = len(verts)
            for i in range(seg):
                a = TAU * i / seg
                verts.append((r * math.cos(a), r * math.sin(a), z))
            rings.append(("ring", base))
    n = len(rings)
    pairs = range(n) if closed else range(n - 1)
    for j in pairs:
        a_kind, a_i = rings[j]
        b_kind, b_i = rings[(j + 1) % n]
        for i in range(seg):
            i2 = (i + 1) % seg
            if a_kind == "ring" and b_kind == "ring":
                faces.append((a_i + i, a_i + i2, b_i + i2, b_i + i))
            elif a_kind == "pole":
                faces.append((a_i, b_i + i2, b_i + i))
            else:
                faces.append((a_i + i, a_i + i2, b_i))
    if cap_bottom and rings[0][0] == "ring":
        base = rings[0][1]
        faces.append(tuple(reversed(range(base, base + seg))))
    if cap_top and rings[-1][0] == "ring":
        base = rings[-1][1]
        faces.append(tuple(range(base, base + seg)))
    return verts, faces


def sphere(r, u=18, v=9, z=0.0, squash=1.0):
    pts = []
    for k in range(v + 1):
        a = -math.pi / 2 + math.pi * k / v
        pts.append((r * math.cos(a), z + r * math.sin(a) * squash))
    return revolve(pts, seg=u)


def cylinder(r1, r2, h, seg=24, z=0.0, caps=True):
    return revolve([(r1, z), (r2, z + h)], seg=seg, cap_bottom=caps, cap_top=caps)


def torus(R, r, major=32, minor=8, z=0.0):
    profile = [(R + r * math.cos(TAU * k / minor), z + r * math.sin(TAU * k / minor))
               for k in range(minor)]
    return revolve(profile, seg=major, closed=True)


def capsule(radius, length, seg=22, arc=3):
    """Z軸方向のカプセル（スタジアム断面の回転体）。底面 z=0、上面 z=length。"""
    pts = []
    for k in range(arc + 1):
        a = -math.pi / 2 + (math.pi / 2) * k / arc
        pts.append((radius * math.cos(a), radius + radius * math.sin(a)))
    for k in range(1, arc + 1):
        a = (math.pi / 2) * k / arc
        pts.append((radius * math.cos(a), (length - radius) + radius * math.sin(a)))
    return revolve(pts, seg=seg)


def prism(poly, z0, z1):
    """XY平面の多角形 poly を z0→z1 に押し出す。"""
    n = len(poly)
    verts = [(x, y, z0) for x, y in poly] + [(x, y, z1) for x, y in poly]
    faces = [tuple(reversed(range(n))), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return verts, faces


def box(sx, sy, sz, z0=0.0):
    return prism([(-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2)], z0, z0 + sz)


def wobble(geo, amp=0.02, freq=9):
    """円周方向に半径を波打たせる（クッキーのふち・紙カップのひだ）。"""
    verts, faces = geo
    out = []
    for x, y, z in verts:
        d = math.hypot(x, y)
        if d < 1e-9:
            out.append((x, y, z))
            continue
        a = math.atan2(y, x)
        k = 1.0 + amp * math.sin(freq * a)
        out.append((x * k, y * k, z))
    return out, faces


def scale_poly(poly, s):
    return [(x * s, y * s) for x, y in poly]


def profile_radius(profile, z):
    """(半径, z) 列から高さ z の半径を線形補間で求める。"""
    for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
        if z0 <= z <= z1 and z1 > z0:
            t = (z - z0) / (z1 - z0)
            return r0 + (r1 - r0) * t
    return profile[-1][0]


# ---------------------------------------------------------------------------
# ビルダー
# ---------------------------------------------------------------------------


class Sweet:
    def __init__(self, sid, name, cream_z):
        self.sid = sid
        self.name = name
        self.cream_z = cream_z          # 組み立て座標での「クリームが乗る面」の高さ
        self.bm = bmesh.new()
        self.mat_keys = []
        self.part_count = 0

    def _mat_index(self, key):
        if key not in self.mat_keys:
            self.mat_keys.append(key)
        return self.mat_keys.index(key)

    def add(self, geo, mat, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0),
            scale=(1.0, 1.0, 1.0), smooth=True):
        """geo を変形してBMeshへ追加する。mat は key 文字列か、面中心→key の関数。"""
        verts, faces = geo
        m = Matrix.Translation(Vector(loc)) @ Euler(rot, "XYZ").to_matrix().to_4x4() \
            @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
        bmv = [self.bm.verts.new(m @ Vector(v)) for v in verts]
        new_faces = []
        for f in faces:
            try:
                nf = self.bm.faces.new([bmv[i] for i in f])
            except ValueError:
                continue  # 重複面は捨てる（極の縮退など）
            new_faces.append(nf)
        if not new_faces:
            return
        bmesh.ops.recalc_face_normals(self.bm, faces=new_faces)
        for nf in new_faces:
            key = mat(nf.calc_center_median()) if callable(mat) else mat
            nf.material_index = self._mat_index(key)
            nf.smooth = smooth
        self.part_count += 1

    def finish(self):
        """メッシュ化 → 正規化 → オブジェクト生成。"""
        mesh = bpy.data.meshes.new(self.sid)
        self.bm.to_mesh(mesh)
        self.bm.free()
        mesh.validate(verbose=False)
        mesh.update()

        co = [v.co.copy() for v in mesh.vertices]
        if not co:
            raise RuntimeError("%s: 頂点が空" % self.sid)
        xs = [c.x for c in co]
        ys = [c.y for c in co]
        zs = [c.z for c in co]
        cx = (min(xs) + max(xs)) / 2.0
        cy = (min(ys) + max(ys)) / 2.0
        zmin = min(zs)
        max_r = max(math.hypot(c.x - cx, c.y - cy) for c in co)
        s = 1.0 / max_r

        for v in mesh.vertices:
            v.co = Vector(((v.co.x - cx) * s, (v.co.y - cy) * s, (v.co.z - zmin) * s))
        mesh.update()

        if CRUMB_MATERIALS.intersection(self.mat_keys):
            pastry_uv(mesh, self.mat_keys)
        mesh.calc_loop_triangles()
        tris = len(mesh.loop_triangles)

        co = [v.co for v in mesh.vertices]
        r2 = max(math.hypot(c.x, c.y) for c in co)
        height = max(c.z for c in co)
        zmin2 = min(c.z for c in co)
        cream_y = (self.cream_z - zmin) * s

        obj = bpy.data.objects.new(self.sid, mesh)
        for key in self.mat_keys:
            mesh.materials.append(make_material(key))
        bpy.context.scene.collection.objects.link(obj)

        # 手続き的な陰影を焼き込む（パーツ間の遮蔽・接地部の暗み）
        bake_shading(obj, mesh)

        return obj, tris, r2, height, zmin2, cream_y


# ---------------------------------------------------------------------------
# 各お菓子
#   cream_z は「クリーム／トッピングが乗る上面」の高さ（組み立て座標）
# ---------------------------------------------------------------------------


def fluted(profile, teeth, depth):
    verts, faces = revolve(profile, seg=teeth*4, cap_bottom=True, cap_top=True)
    return [(x*(1+depth*math.cos(teeth*math.atan2(y,x))),
             y*(1+depth*math.cos(teeth*math.atan2(y,x))),z) for x,y,z in verts], faces


def blueberries(b, locations):
    for x,y,z,r in locations:
        b.add(sphere(r,12,6,squash=0.9),"blueberry_skin",loc=(x,y,z))
        b.add(fluted([(r*0.24,0),(r*0.36,r*0.09),(r*0.16,r*0.05)],5,0.18),
              "berry_bloom",loc=(x,y,z+r*0.84))


def donut_point(a, t, icing):
    r = 0.57 + (0.34+icing)*math.cos(t)
    r *= 1+0.014*math.sin(3*a)+0.009*math.cos(7*a)
    return r*math.cos(a),r*math.sin(a),0.30+(0.29+icing)*math.sin(t)


def build_donut(b):
    b.add(torus(0.57,0.34,48,12,z=0.34),"brioche",scale=(1,1,0.87))
    # One continuous glaze with an irregular lip on the inside and outside.
    rings=[]
    for j in range(10):
        ring=[]
        for i in range(48):
            a=i*TAU/48
            lip=0.26-0.71*(0.5+0.5*math.cos(7*a+math.sin(3*a)))**4
            t=lip+(math.pi-0.12-lip)*j/9
            ring.append(donut_point(a,t,0.029))
        rings.append(ring)
    vertices,faces=skin(rings)
    b.add((vertices,faces[:-2]),"raspberry_glaze")
    for i in range(19):
        a=i*2.399
        t=0.83+0.24*(i%6)
        x,y,z=donut_point(a,t,0.042)
        b.add(sphere(0.035,6,3,squash=0.64),["white","pistachio","sprinkle_a"][i%3],
              scale=(1.9,0.76,1),rot=(0,0,a+0.4*i),loc=(x,y,z))


def build_macaron(b):
    for flip, height in ((-1,0.31),(1,0.46)):
        profile=[(0.73,0),(0.80,0.045),(0.83,0.11),(0.80,0.18),
                 (0.71,0.235),(0.51,0.273),(0,0.29)]
        b.add(revolve([(r,height+flip*z) for r,z in profile],seg=40,cap_bottom=True),"almond_shell")
        b.add(fluted([(0.72,height),(0.79,height+flip*0.018),(0.80,height+flip*0.062)],25,0.034),
              "macaron_foot")
    b.add(revolve([(0.71,0.303),(0.78,0.33),(0.795,0.365),(0.78,0.414),(0.72,0.46)],
                  seg=40,cap_bottom=True,cap_top=True),"filling")
    b.add(torus(0.755,0.037,36,6,z=0.40),"berry_jam")


def tart_shell(b):
    profile=[(0.56,0.02),(0.66,0.045),(0.78,0.255),(0.79,0.30),
             (0.76,0.325),(0.69,0.315),(0.66,0.26),(0.58,0.125),(0,0.125)]
    b.add(fluted(profile,16,0.047),"biscuit")
    b.add(revolve([(0.57,0.126),(0.55,0.133),(0,0.133)],seg=36), "tart_floor")
    for i in range(12):
        a=i*2.39996
        r=0.48*math.sqrt((i+0.5)/12)
        b.add(sphere(0.022,7,3,squash=0.14),"waffle_pocket",
              loc=(r*math.cos(a),r*math.sin(a),0.134))


def build_tart(b):
    tart_shell(b)
    b.add(revolve([(0.58,0.13),(0.68,0.26),(0.655,0.29),(0,0.30)],seg=32),"custard")
    blueberries(b,[(0.35,0.31,0.39,0.13),(0.16,0.46,0.38,0.11),(-0.38,-0.30,0.38,0.12)])
    for i in range(3):
        b.add(sphere(0.16,14,6,squash=0.72),"peach",
              scale=(1.35,0.50,0.8),rot=(0,-0.30,0.60),loc=(-0.36+i*0.12,0.24+i*0.044,0.34+i*0.012))


def build_waffle(b):
    # Recessed square pockets share the height of the outer baked rim.
    base=[(-1.22,-0.43),(-1.18,-0.48),(1.18,-0.48),(1.22,-0.43),
          (1.22,0.43),(1.18,0.48),(-1.18,0.48),(-1.22,0.43)]
    b.add(skin([[(x*k,y*k,z) for x,y in base] for k,z in
                [(0.98,0),(1,0.035),(1,0.085),(0.98,0.098)]]),"waffle_rim")
    for ix in range(8):
        for iy in range(3):
            cx,cy=(ix-3.5)*0.292,(iy-1)*0.296
            rings=[[(cx+dx*w,cy+dy*h,z) for dx,dy in [(-1,-1),(1,-1),(1,1),(-1,1)]]
                   for w,h,z in [(0.146,0.148,0.146),(0.119,0.119,0.146),(0.093,0.093,0.105)]]
            verts,faces=skin(rings)
            b.add((verts,faces[:-2]+[faces[-1]]),lambda p: "waffle_rim" if p.z>0.142 else "waffle_pocket",smooth=False)


def skin(rings):
    count = len(rings[0])
    faces = []
    for k in range(len(rings) - 1):
        for j in range(count):
            a = k * count + j
            b = k * count + (j + 1) % count
            faces.append((a, b, b + count, a + count))
    faces.extend([tuple(reversed(range(count))),
                  tuple((len(rings) - 1) * count + j for j in range(count))])
    return [point for ring in rings for point in ring], faces


def eclair_layer(b, profile, material, fluted=False, glaze=False):
    rings = []
    for scale, height in profile:
        ring = []
        for i in range(48):
            a = TAU * i / 48
            c, s = math.cos(a), math.sin(a)
            x = math.copysign(abs(c)**0.76, c)
            y = math.copysign(abs(s)**0.78, s)
            fold = 0.015 * math.sin(16*a + 2*height) if fluted else 0
            drip = (0.018 + 0.035 * (0.5 + 0.5*math.cos(7*a + 0.4))**5) if glaze else 0
            z = height + fold + 0.009*math.sin(5*a) - drip*scale**8
            ring.append((1.06*x*scale, 0.37*y*(scale + fold), z))
        rings.append(ring)
    b.add(skin(rings), material)


def build_eclair(b):
    eclair_layer(b, [(0.83,0.04),(0.95,0.075),(1,0.15),(0.99,0.22),
                     (0.93,0.26)], "choux", fluted=True)
    eclair_layer(b, [(0.91,0.235),(0.97,0.265),(0.96,0.31),(0.90,0.33)], "custard")
    eclair_layer(b, [(0.92,0.30),(0.99,0.34),(0.975,0.37),(0.88,0.407),
                     (0.70,0.437)], "choux", fluted=True)
    eclair_layer(b, [(0.89,0.423),(0.981,0.444),(0.94,0.47),(0.82,0.505),
                     (0.60,0.525),(0.25,0.532)], "ganache", glaze=True)
    # Fine hand-piped caramel chevrons lie against the domed ganache.
    for i in range(7):
        x = -0.63 + i*0.205
        rings = []
        for j in range(13):
            t = j/12
            y = (t-0.5)*0.49 * (1-0.30*abs(x))
            px = x + 0.13*math.sin(math.pi*t)
            r = ((abs(px)/1.06)**2.65 + (abs(y)/0.37)**2.65)**(1/2.65)
            z = 0.535 - 0.066*r**2.6
            width = 0.010 * (0.35 + 0.65*math.sin(math.pi*t)**0.35)
            rings.append([(px+width*math.cos(k*TAU/5), y, z+width*math.sin(k*TAU/5))
                          for k in range(5)])
        b.add(skin(rings), "caramel_line")


def cake_layer(b, z, height, material, inset=0):
    # Rounded corners, with a separate bevel around each soft cut edge.
    rings = []
    for lip, h in [(0.022,0),(0,0.018),(0,height-0.018),(0.022,height)]:
        ring = []
        for corner in range(4):
            a = corner*math.pi/2
            cx = (0.83-inset) * (1 if corner in (0,3) else -1)
            cy = (0.39-inset) * (1 if corner in (0,1) else -1)
            for j in range(5):
                t = a + j*math.pi/8
                ring.append((cx+(0.085-lip)*math.cos(t), cy+(0.085-lip)*math.sin(t),z+h))
        rings.append(ring)
    b.add(skin(rings), material)


def build_shortcake(b):
    cake_layer(b, 0, 0.18, "sponge")
    cake_layer(b, 0.176, 0.245, "cream", 0.004)
    cake_layer(b, 0.415, 0.17, "sponge")
    cake_layer(b, 0.58, 0.082, "cream")
    # Cross-cut strawberries embedded flush in the two long faces.
    for side in (-1,1):
        for i, x in enumerate((-0.61,-0.21,0.21,0.61)):
            z = 0.30 + 0.009*math.sin(i*3)
            outline = [(0,0.097),(-0.086,0.095),(-0.134,0.047),(-0.125,-0.014),
                       (-0.074,-0.070),(0,-0.102),(0.084,-0.067),(0.132,0),
                       (0.127,0.055),(0.080,0.095)]
            verts = [(x+dx,side*0.473,z+dz) for dx,dz in outline]
            face = tuple(range(len(verts)))
            b.add((verts,[face if side < 0 else tuple(reversed(face))]),"berry_flesh",smooth=False)
    # A single seeded berry beside the piping lane.
    cx, cy, base = 0.53, 0.22, 0.655
    profile = [(0,0),(0.11,0.008),(0.15,0.05),(0.151,0.107),
               (0.13,0.165),(0.096,0.222),(0.054,0.269),(0,0.30)]
    b.add(revolve(profile,seg=24),"strawberry_skin",loc=(cx,cy,base))
    for row,z in enumerate((0.052,0.108,0.164,0.217)):
        n = 10-row
        for j in range(n):
            a = TAU*(j+0.48*row)/n
            r = profile_radius(profile,z)
            b.add(sphere(0.008,5,3,squash=1.6),"seed",
                  loc=(cx+r*math.cos(a),cy+r*math.sin(a),base+z))
    for j in range(5):
        a = TAU*j/5
        verts = [(0,0,0),(0.09,-0.04,0.018),(0.19,0,0),(0.09,0.04,0.018),(0.09,0,0.038)]
        b.add((verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)]),"mint",
              loc=(cx,cy,base+0.007),rot=(0,0,a))


def build_cookie(b):
    disc=revolve([(0.74,0.01),(0.87,0.04),(0.92,0.105),(0.90,0.17),
                  (0.78,0.216),(0.53,0.246),(0,0.255)],seg=52,cap_bottom=True)
    b.add(wobble(disc,0.027,7),"cookie_crumb")
    for i in range(16):
        a=i*2.399
        r=0.78*math.sqrt((i+0.5)/16)
        z=0.257-0.06*r*r
        size=0.066+0.02*(i%3)
        b.add(revolve([(size,0),(size*0.85,0.035),(size*0.38,0.064),(0,0.083)],seg=5),
              "dark_chip",loc=(r*math.cos(a),r*math.sin(a),z-0.018),rot=(0.12,0.19,a))
    for i in range(12):
        a=i*1.92
        r=0.28+0.10*(i%5)
        b.add(sphere(0.028,5,3),"crumble",scale=(1.6,0.7,0.5),rot=(0,0,a),
              loc=(r*math.sin(a),r*math.cos(a),0.256-0.06*r*r))


def build_parfait(b):
    stem=[(0.42,0.01),(0.43,0.045),(0.29,0.08),(0.13,0.1),(0.105,0.26),
          (0.16,0.32),(0.36,0.40)]
    b.add(revolve(stem,seg=32,cap_bottom=True,cap_top=True),"crystal")
    # Wavy boundaries between raspberry coulis, vanilla mousse and biscuit crumb.
    levels=[(0.33,0.35),(0.48,0.54),(0.55,0.66),(0.63,0.82),(0.68,0.96),
            (0.73,1.12),(0.77,1.25)]
    rings=[]
    for r,h in levels:
        rings.append([(r*math.cos(a),r*math.sin(a),h+0.025*math.sin(3*a+4*h))
                      for a in [j*TAU/36 for j in range(36)]])
    for j,mat in enumerate(["berry_jam","filling","biscuit","filling","raspberry_glaze","filling"]):
        b.add(skin(rings[j:j+2]),mat)
    b.add(torus(0.77,0.028,36,6,z=1.26),"crystal")
    blueberries(b,[(-0.34,0.30,1.335,0.13),(-0.12,0.46,1.34,0.115)])
    b.add(box(0.18,0.065,0.48),"waffle_rim",loc=(0.41,0.31,1.19),rot=(0,-0.35,-0.28))


def build_strawberry(b):
    profile=[(0,0),(0.15,0.023),(0.23,0.075),(0.32,0.17),(0.43,0.32),
             (0.48,0.47),(0.475,0.55),(0.425,0.625),(0.33,0.68),(0.19,0.698),(0,0.68)]
    b.add(revolve(profile,seg=40),"strawberry_skin")
    for row,(z,n) in enumerate([(0.12,7),(0.21,10),(0.31,13),(0.41,15),(0.51,16),(0.60,13)]):
        r=profile_radius(profile,z)
        for j in range(n):
            a=TAU*(j+0.46*row)/n
            b.add(sphere(0.012,5,3,squash=1.58),"seed",loc=(r*math.cos(a),r*math.sin(a),z))
    for i in range(7):
        a=i*TAU/7
        verts=[(0,0,0),(0.16,-0.074,0.016),(0.35,0,-0.035),(0.18,0.085,0.02),(0.17,0,0.07)]
        b.add((verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)]),"pistachio",
              rot=(0,0,a),loc=(0,0,0.69))
    b.add(cylinder(0.033,0.023,0.095,seg=9), "leaf",rot=(0,0.45,0),loc=(0,0,0.70))


def build_pancake(b):
    for i in range(3):
        r=0.91-0.035*i
        h=i*0.198
        disc=revolve([(0.84*r,0),(0.96*r,0.024),(r,0.08),(0.985*r,0.15),
                      (0.92*r,0.183),(0.72*r,0.198),(0,0.213)],seg=36,cap_bottom=True)
        b.add(wobble(disc,0.012,5),lambda p: "griddle" if p.z>h+0.17 else "sponge",
              loc=(0.015*math.sin(i*2),0,h))
    rings=[]
    for radius,height in [(0.82,0.55),(0.83,0.59),(0.64,0.61),(0.20,0.616)]:
        rings.append([(radius*math.cos(a),radius*math.sin(a),
                       height-(0.18*(0.5+0.5*math.cos(5*a+math.sin(3*a)))**9 if height==0.55 else 0))
                      for a in [j*TAU/40 for j in range(40)]])
    b.add(skin(rings),"maple")
    b.add(revolve([(0.19,0),(0.21,0.026),(0.18,0.078),(0.15,0.085)],seg=4,cap_top=True),
          "butter",rot=(0,0,0.26),loc=(-0.31,0.31,0.607))


def build_blueberry(b):
    blueberries(b, [(0,0,0.27,0.30)])


def build_grape(b):
    b.add(sphere(0.268,26,14,z=0.30,squash=1.12),"grape_skin")
    b.add(revolve([(0.029,0),(0.027,0.036),(0.014,0.067)],seg=9,cap_top=True),
          "grape_stem",rot=(0,0.32,0),loc=(0,0,0.58))


def build_raspberry(b):
    b.add(sphere(0.19,16,8,z=0.225,squash=1.1),"berry_jam")
    for k,(r,height,count) in enumerate([(0.07,0.08,5),(0.155,0.16,9),(0.184,0.27,10),
                                          (0.157,0.375,9),(0.084,0.424,6)]):
        for i in range(count):
            a=TAU*(i+0.42*k)/count
            b.add(sphere(0.087,8,4,squash=0.96),"raspberry_skin",
                  loc=(r*math.cos(a),r*math.sin(a),height))


MODELS = [
    ("waffle", "格子ワッフル", 0.146, build_waffle),
    ("tart_shell", "焼きたてのタルト台", 0.133, tart_shell),
    ("blueberry", "ブルーベリー", 0.54, build_blueberry),
    ("grape", "ぶどう", 0.60, build_grape),
    ("raspberry", "ラズベリー", 0.47, build_raspberry),
    ("donut", "ドーナツ", 0.619, build_donut),
    ("macaron", "マカロン", 0.75, build_macaron),
    ("tart", "フルーツタルト", 0.30, build_tart),
    ("eclair", "エクレア", 0.532, build_eclair),
    ("pancake", "パンケーキ", 0.616, build_pancake),
    ("shortcake", "いちごのケーキ", 0.662, build_shortcake),
    ("cookie", "クッキー", 0.255, build_cookie),
    ("parfait", "いちごパフェ", 1.25, build_parfait),
    ("strawberry", "いちご", 0.70, build_strawberry),
]


# ---------------------------------------------------------------------------
# 書き出し
# ---------------------------------------------------------------------------


def export_glb(obj, path):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    kwargs = dict(filepath=path, export_format="GLB", use_selection=True,
                  export_yup=True, export_apply=True,
                  export_vertex_color="ACTIVE", export_all_vertex_colors=False)
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError as exc:  # 引数名が違うバージョン向けの保険
        print("[warn] export_scene.gltf 引数を簡約: %s" % exc)
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(GLB_DIR, exist_ok=True)
    _register_cream_volume()


def _register_cream_volume():
    """盛り付け前の生地と果物を作る。クリームはプレイヤーが絞るため、ここには含めない。"""
    entries = []
    print("=== build_sweets: %d models -> %s" % (len(MODELS), GLB_DIR))
    for sid, name, cream_z, fn in MODELS:
        b = Sweet(sid, name, cream_z)
        fn(b)
        obj, tris, radius, height, zmin, cream_y = b.finish()
        if tris > MAX_TRIS:
            raise RuntimeError("%s: tris=%d が上限 %d を超過" % (sid, tris, MAX_TRIS))
        path = os.path.join(GLB_DIR, "%s.glb" % sid)
        export_glb(obj, path)
        size = os.path.getsize(path)
        print("[build] %-11s tris=%4d parts=%2d radius=%.3f height=%.3f "
              "y_min=%.3f creamY=%.3f file=%s (%d bytes)"
              % (sid, tris, b.part_count, radius, height, zmin, cream_y,
                 os.path.basename(path), size))
        entries.append({
            "id": sid,
            "name": name,
            "creamY": round(cream_y, 4),
            "radius": round(radius, 4),
            "height": round(height, 4),
            "tris": tris,
        })
        bpy.data.objects.remove(obj, do_unlink=True)

    with open(JSON_PATH, "w", encoding="utf-8") as fp:
        json.dump(entries, fp, ensure_ascii=False, indent=2)
        fp.write("\n")
    print("[build] wrote %s" % JSON_PATH)
    total = sum(e["tris"] for e in entries)
    print("[build] tris total=%d max=%d / model (limit %d)"
          % (total, max(e["tris"] for e in entries), MAX_TRIS))


main()
