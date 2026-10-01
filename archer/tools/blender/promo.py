# Renders a promo banner (store feature graphic, 1024 × 500 by default): the five heroes
# side by side in front of the portal, their pets flying around them. The title is added
# afterwards (tools/blender/promo.mjs).
#
#   blender -b -P tools/blender/promo.py -- <heroes dir> <pets_raw.glb> <out.png> [width] [height]
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from icon import emission_material, srgb  # noqa: E402
from portraits import bounds, load_hero, setup_scene  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC, PETS, OUT = argv[0], argv[1], argv[2]
W = int(argv[3]) if len(argv) > 3 else 2048
H = int(argv[4]) if len(argv) > 4 else 1000

bpy.ops.wm.read_factory_settings(use_empty=True)
cam = setup_scene(W)
scene = bpy.context.scene
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.line_thickness = H / 420
scene.render.film_transparent = False
scene.cycles.samples = 64

# Centre stage for the archer, the others around, turned toward the middle.
LINEUP = [('ranger', -1.12, -0.1, -22), ('assassin', -0.56, -0.05, -12), ('archer', 0, 0, 0), ('knight', 0.56, -0.05, 12), ('mage', 1.12, -0.1, 22)]
tops = []
for hero, x, back, turn in LINEUP:
    objs = load_hero(os.path.join(SRC, f'{hero}.glb'), hero)
    arm = next(o for o in objs if o.type == 'ARMATURE')
    arm.location = (x, back, 0)
    arm.rotation_euler = (0, 0, math.radians(turn))
    bpy.context.view_layer.update()
    meshes = [o for o in objs if o.type == 'MESH' and not o.hide_render]
    lo, hi = bounds([o for o in meshes if o.name.startswith(('Face', 'Hair'))])
    tops.append(hi.z)
top = max(tops)

# Pets: one beside each gap between heroes, at shoulder height.
bpy.ops.import_scene.gltf(filepath=PETS)
# They face -Y as imported: turned round to face the camera.
for name, x, z, turn in [('owl', -0.84, 1.12, -20), ('bat', -0.28, 1.2, -10), ('salamander', 0.28, 1.18, 10), ('frostling', 0.84, 1.1, 20)]:
    pet = bpy.data.objects.get(name)
    if pet:
        pet.location = (x, 0.4, z)
        pet.rotation_mode = 'XYZ'
        pet.rotation_euler = (0, 0, math.radians(180 + turn))
        pet.scale = (0.85, 0.85, 0.85)

# Sky and portal behind.
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, -2.5, 1.2), rotation=(math.radians(90), 0, 0))
bpy.context.object.data.materials.append(emission_material('sky', srgb('#3a7fa0'), srgb('#121838'), radius=4, middle=(0.55, srgb('#22406e'))))
bpy.ops.mesh.primitive_circle_add(vertices=96, radius=0.9, fill_type='NGON', location=(0, -1.2, 1.45), rotation=(math.radians(90), 0, 0))
bpy.context.object.data.materials.append(emission_material('portal', srgb('#f2fcff'), srgb('#1b4f9a'), strength=1.3, radius=0.9, middle=(0.45, srgb('#5cc8ff'))))
bpy.ops.mesh.primitive_torus_add(major_radius=0.95, minor_radius=0.07, major_segments=64, minor_segments=12, location=(0, -1.2, 1.45), rotation=(math.radians(90), 0, 0))
ring = bpy.context.object
stone = bpy.data.materials.new('stone')
stone.use_nodes = True
stone.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = srgb('#c9c4d6')
ring.data.materials.append(stone)
for poly in ring.data.polygons:
    poly.use_smooth = True
for i in range(30):
    a = i * 2.39996
    r = 1.0 + 0.5 * ((i * 37) % 11) / 11
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.012 + 0.012 * (i % 3), location=(math.cos(a) * r * 1.6, -1.0, 1.45 + math.sin(a) * r * 0.6))
    bpy.context.object.data.materials.append(emission_material(f'spark{i}', srgb('#fffbe0'), srgb('#ffd27a'), strength=3.0, radius=0.03))

# Upper bodies; room left at the top for the title.
width = 2.9
cam.data.ortho_scale = width
view_h = width * H / W
cam.location = (0, 4, top + 0.05 - view_h / 2 + view_h * 0.3)
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('rendered promo', OUT)
