"""Build the belt-side countertop sprinkle doser in Blender, Z up."""
import math
import random
from pathlib import Path
import bpy
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
rng = random.Random(29)

def material(name, rgb, metal=0, rough=.32, alpha=1):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, alpha)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    for key, value in [('Base Color', (*rgb, 1)), ('Metallic', metal),
                       ('Roughness', rough), ('Alpha', alpha)]:
        shader.inputs[key].default_value = value
    return mat

mint = material('Pistachio powder coat', (.21,.60,.49), .18)
cream = material('Ivory enamel', (.98,.85,.66), .16)
brass = material('Brushed champagne brass', (.82,.51,.22), .73)
steel = material('Satin stainless', (.51,.59,.61), .74)
rubber = material('Graphite gaskets', (.05,.075,.073), .08)
glass = material('Clear hopper', (.72,.94,.88), .02,.13,.16)
bright = [material('Sugar '+str(i), c) for i,c in enumerate([
    (.99,.20,.26),(.99,.69,.11),(.19,.74,.68),(.53,.32,.87),(1,.88,.65)])]

def finish(obj,name,mat,bevel=0):
    obj.name=name
    obj.data.materials.append(mat)
    if bevel:
        mod=obj.modifiers.new('Soft machined edges','BEVEL')
        mod.width=bevel
        mod.segments=3
        obj.modifiers.new('Face normals','WEIGHTED_NORMAL')
    return obj

def block(name, pos, size, mat, bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    obj=bpy.context.object
    obj.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,name,mat,bevel)

def cylinder(name,pos,r,h,mat,axis=(0,0,1),bevel=.01):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=r,depth=h,location=pos)
    obj=bpy.context.object
    obj.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler()
    return finish(obj,name,mat,bevel)

def turned(name,profile,mat):
    # Closed wall section with explicit inner bore and rolled outer lips.
    n=64
    verts=[(r*math.cos(i*math.tau/n),r*math.sin(i*math.tau/n),z)
           for r,z in profile for i in range(n)]
    faces=[]
    for j in range(len(profile)):
        for i in range(n):
            k=(j+1)%len(profile)
            faces.append((j*n+i,j*n+(i+1)%n,k*n+(i+1)%n,k*n+i))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    for poly in mesh.polygons: poly.use_smooth=True
    return finish(obj,name,mat)

def strut(start,end,thickness):
    a,b=Vector(start),Vector(end)
    obj=block('Cast diagonal gusset',(a+b)/2,(.16,thickness,(a-b).length),mint)
    obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()

# The bedplate and its four feet sit behind the conveyor. The boxed mast
# carries a short triangulated cantilever into the collar around the hopper.
for x in (-.44,.44):
    for y in (1.55,2.23):
        cylinder('Leveling foot',(x,y,.04),.13,.08,rubber)
block('Bedplate',(0,1.89,.18),(1.18,1.03,.24),mint,.10)
block('Column shoe',(0,1.89,.36),(.61,.58,.20),cream)
block('Upright',(0,1.89,1.82),(.40,.39,2.85),mint,.065)
block('Top elbow',(0,1.87,3.24),(.49,.48,.39),cream,.075)
block('Cantilever',(0,1.12,3.24),(.28,1.61,.22),cream,.05)
strut((0,1.77,2.46),(0,.83,3.18),.14)
for x in (-.42,.42):
    for y in (1.56,2.22):
        cylinder('Anchor head',(x,y,.31),.065,.035,brass)
turned('Load bearing collar',[(.46,3.12),(.53,3.14),(.55,3.18),(.55,3.31),(.53,3.35),(.46,3.35)],mint)
turned('Spun steel funnel',[(.18,2.54),(.205,2.54),(.205,2.65),(.48,3.07),(.505,3.11),(.505,3.24),(.475,3.24),(.455,3.12),(.18,2.68)],steel)
turned('Clear cartridge',[(.47,3.29),(.504,3.29),(.514,3.34),(.514,3.98),(.504,4.02),(.475,4.02)],glass)
turned('Lower seal',[(.46,3.32),(.52,3.32),(.52,3.37),(.46,3.37)],brass)
cylinder('Twist lid',(0,0,4.02),.54,.12,cream,bevel=.035)
cylinder('Lid finial',(0,0,4.12),.13,.10,brass,bevel=.025)
turned('Discharge lip',[(.18,2.50),(.215,2.50),(.22,2.53),(.214,2.58),(.18,2.58)],brass)
# Butterfly disk pivots on a through shaft inside the actual open spout.
gate=cylinder('MeteringValve',(0,0,2.61),.177,.021,brass)
cylinder('Pivot shaft',(0,0,2.61),.029,.52,steel,(1,0,0))
block('Actuator housing',(.30,0,2.64),(.21,.24,.25),mint,.045)
# The crank and coloured pointer are keyed to the same shaft as the valve.
for part in [cylinder('Crank hub',(-.254,0,2.61),.055,.05,brass,(1,0,0)),
             block('Crank arm',(-.274,0,2.70),(.035,.048,.19),brass,.016),
             cylinder('Crank indicator',(-.274,0,2.80),.043,.05,mint,(1,0,0))]:
    part.parent = gate
    part.matrix_parent_inverse = gate.matrix_world.inverted()

for i in range(3):
    a=i*math.tau/3
    block('Lid catch',(.50*math.cos(a),.50*math.sin(a),3.96),(.08,.08,.13),brass,.02)

# Dense stock with a sloping free surface; all rods lie inside the cartridge.
grains=[]
for layer in range(8):
    for row in range(-5,6):
        for col in range(-5,6):
            x=col*.082+(row%2)*.041+rng.uniform(-.013,.013)
            y=row*.074+rng.uniform(-.012,.012)
            z=3.31+layer*.049+rng.uniform(-.014,.014)
            if math.hypot(x,y)>.45 or z>3.67+.11*x-.14*math.hypot(x,y): continue
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=1,location=(x,y,z))
            obj=bpy.context.object
            obj.scale=(.051,.019,.018)
            obj.rotation_euler=(0,rng.uniform(-.5,.5),rng.random()*math.tau)
            finish(obj,'Sugar rod',rng.choice(bright))
            grains.append(obj)
bpy.ops.object.select_all(action='DESELECT')
for obj in grains: obj.select_set(True)
bpy.context.view_layer.objects.active=grains[0]
bpy.ops.object.join()
bpy.context.object.name='Sugar stock'
out=Path(__file__).resolve().parents[2]/'public/models/topping-station.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_apply=True)
