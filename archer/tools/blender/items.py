# Renders Aetherfall's item icons: every weapon, armour, ring and amulet modelled here,
# the pets imported from the uncompressed pets .glb (tools/blender/pets.py).
#
#   blender -b -P tools/blender/items.py -- <out dir> <pets_raw.glb> [size] [only,ids]
#
# Writes <out dir>/<id>.png (transparent, `size` px, default 384) and order.json.
# Cycles on the CPU with Freestyle outlines in the game's outline colour.
import json
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import Kit, join, root  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/items'
PETS_GLB = argv[1] if len(argv) > 1 else None
SIZE = int(argv[2]) if len(argv) > 2 else 384
ONLY = set(argv[3].split(',')) if len(argv) > 3 and argv[3] else None
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
K = Kit('item')
K.glow.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.2
sphere, ico, cone, cyl, box, torus, shape, tube = K.sphere, K.ico, K.cone, K.cyl, K.box, K.torus, K.shape, K.tube
METAL, GLOW = K.metal, K.glow

WOOD, WOOD_DARK, LEATHER, STRING = '#a8662f', '#6e4424', '#5a3a22', '#f2ead8'
STEEL, STEEL_DARK, GOLD, IRON = '#cfd7e0', '#7d8794', '#f0bf45', '#4a4450'


def arc(z0, z1, bulge, n=14, tip_back=0.0):
    """Points of a bow limb in the XZ plane: a bulge to +X, tips curling back."""
    pts = []
    for i in range(n + 1):
        t = i / n
        z = z0 + (z1 - z0) * t
        u = 2 * t - 1
        x = bulge * (1 - u * u) - tip_back * max(0, abs(u) - 0.8) / 0.2
        pts.append((x, 0, z))
    return pts


def arrow(x0, x1, z=0.0, fletch='#d8453a'):
    parts = [tube([(x0, 0, z), (x1, 0, z)], 0.022, '#c79a5a')]
    parts.append(cone((x1 + 0.06, 0, z), 0.06, 0, 0.14, STEEL, rot=(0, math.pi / 2, 0), verts=4, mat=METAL))
    for s in (1, -1):
        parts.append(shape([(x0, 0), (x0 + 0.16, 0), (x0 + 0.09, s * 0.08), (x0 - 0.01, s * 0.09)], 0.016, fletch, loc=(0, 0, z)))
    return parts


# ------------------------------------------------------------------ weapons
def bow():
    parts = [tube(arc(-0.55, 0.55, 0.24, tip_back=0.05), 0.05, WOOD)]
    parts.append(cyl((0.24, 0, 0), 0.068, 0.2, LEATHER))
    parts.append(tube([(-0.05, 0, -0.55), (-0.02, 0, 0), (-0.05, 0, 0.55)], 0.012, STRING))
    parts += arrow(-0.02, 0.62)
    return parts, (0, math.radians(-45), 0)


def longbow():
    parts = [tube(arc(-0.78, 0.78, 0.17, n=18), 0.045, WOOD_DARK)]
    parts.append(cyl((0.17, 0, 0), 0.062, 0.24, '#3f7a3a'))
    for z in (-0.8, 0.8):
        parts.append(sphere((0, 0, z), (0.055, 0.055, 0.075), GOLD, mat=METAL))
    for z in (-0.13, 0.13):
        parts.append(cyl((0.168, 0, z), 0.058, 0.035, GOLD, mat=METAL))
    parts.append(tube([(0, 0, -0.78), (0, 0, 0.78)], 0.011, STRING))
    return parts, (0, math.radians(-45), 0)


def crossbow():
    # Seen from above: the stock points up, the prod across the top.
    parts = [box((0, 0, -0.05), (0.16, 0.1, 0.95), WOOD, bevel=0.025)]
    parts.append(box((0, 0, -0.5), (0.22, 0.12, 0.2), WOOD_DARK, bevel=0.03))  # butt
    prod = [(x, 0, 0.32 - 0.25 * x * x) for x in [i / 10 - 0.5 for i in range(11)]]
    parts.append(tube(prod, 0.045, STEEL, mat=METAL))
    parts.append(tube([(-0.5, 0, 0.255), (0, 0, 0.0), (0.5, 0, 0.255)], 0.012, STRING))
    parts.append(box((0, -0.05, 0.36), (0.13, 0.04, 0.06), STEEL_DARK, mat=METAL))
    # Bolt along the stock.
    parts.append(tube([(0, -0.07, -0.02), (0, -0.07, 0.5)], 0.022, '#c79a5a'))
    parts.append(cone((0, -0.07, 0.56), 0.055, 0, 0.13, STEEL, verts=4, mat=METAL))
    parts.append(box((0.03, 0.02, -0.25), (0.03, 0.05, 0.1), IRON, mat=METAL))  # trigger
    return parts, (0, math.radians(-40), 0)


def staff():
    shaft = [(0.03 * math.sin(i * 0.9), 0, -0.85 + i * 0.13) for i in range(11)]
    parts = [tube(shaft, 0.06, '#6b4a2e')]
    parts.append(cyl((0.02, 0, -0.2), 0.064, 0.22, '#3b2a5c'))
    for z in (-0.32, -0.08):
        parts.append(cyl((0.02, 0, z), 0.068, 0.035, GOLD, mat=METAL))
    # Claw holding the orb.
    for a in range(3):
        ang = a * 2 * math.pi / 3 + 0.3
        x, y = math.cos(ang) * 0.14, math.sin(ang) * 0.14
        parts.append(tube([(0.01, 0, 0.45), (x * 0.9, y * 0.9, 0.53), (x * 1.05, y * 1.05, 0.66), (x * 0.5, y * 0.5, 0.8)], 0.026, GOLD, mat=METAL))
    parts.append(sphere((0.01, 0, 0.66), (0.15, 0.15, 0.15), '#9a5cf0', seg=18, rings=12, mat=GLOW))
    parts.append(sphere((-0.04, -0.1, 0.71), (0.045, 0.03, 0.045), '#f3e6ff', seg=8, rings=6, mat=GLOW))
    return parts, (0, math.radians(-30), 0)


def blades():
    parts = [torus((0, 0, 0), 0.3, 0.035, STEEL, rot=(math.pi / 2, 0, 0), mat=METAL)]
    parts.append(torus((0, 0, 0), 0.22, 0.028, GOLD, rot=(math.pi / 2, 0, 0), mat=METAL))
    for i in range(4):
        a = i * math.pi / 2
        # A hooked blade swept around the ring.
        pts = []
        for t in [0, 0.25, 0.5, 0.75, 1.0]:
            r = 0.3 + 0.3 * t
            ang = a + 0.6 * t
            pts.append((math.cos(ang) * r, math.sin(ang) * r))
        back = []
        for t in [1.0, 0.6, 0.3, 0.0]:
            r = 0.3 + 0.16 * t
            ang = a - 0.35 + 0.75 * t
            back.append((math.cos(ang) * r, math.sin(ang) * r))
        parts.append(shape(pts + back, 0.03, STEEL, mat=METAL))
    # Leather grips across the middle.
    parts.append(box((0, 0, 0), (0.42, 0.04, 0.05), LEATHER, rot=(0, math.radians(45), 0)))
    parts.append(sphere((0, 0, 0), (0.06, 0.04, 0.06), GOLD, mat=METAL))
    return parts, (math.radians(15), 0, 0)


def shuriken():
    pts = []
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 4
        r = 0.55 if i % 2 == 0 else 0.13
        pts.append((math.cos(a) * r, math.sin(a) * r))
    inner = [(x * 0.8, z * 0.8) for x, z in pts]
    parts = [shape(pts, 0.05, STEEL_DARK, mat=METAL), shape(inner, 0.07, STEEL, mat=METAL)]
    parts.append(cyl((0, 0, 0), 0.075, 0.1, IRON, rot=(math.pi / 2, 0, 0), mat=METAL))
    parts.append(torus((0, 0, 0), 0.075, 0.018, '#c43a3a', rot=(math.pi / 2, 0, 0)))
    return parts, (math.radians(20), math.radians(15), 0)


def tome():
    parts = [box((0, 0, 0), (0.62, 0.16, 0.82), '#5b3a9e', bevel=0.025)]
    parts.append(box((0.03, 0, 0), (0.6, 0.12, 0.78), '#f1e6c8'))  # pages
    parts.append(box((-0.3, 0, 0), (0.06, 0.18, 0.84), '#42286f', bevel=0.02))  # spine
    for x, z in [(0.27, 0.37), (0.27, -0.37)]:
        parts.append(box((x, -0.005, z), (0.1, 0.175, 0.1), GOLD, mat=METAL, bevel=0.01))
    bolt = [(-0.05, 0.25), (0.1, 0.25), (0.02, 0.05), (0.12, 0.05), (-0.08, -0.27), (-0.01, -0.02), (-0.11, -0.02)]
    parts.append(shape(bolt, 0.02, '#ffe14a', loc=(0, -0.085, 0), mat=GLOW))
    parts.append(torus((0, -0.083, 0), 0.2, 0.012, GOLD, rot=(math.pi / 2, 0, 0), mat=METAL))
    return parts, (math.radians(-8), 0, math.radians(-28))


# ------------------------------------------------------------------ armour
TUNIC = [(-0.22, 0.42), (-0.12, 0.46), (0, 0.38), (0.12, 0.46), (0.22, 0.42), (0.44, 0.3), (0.38, 0.12), (0.26, 0.18),
         (0.25, -0.1), (0.32, -0.45), (-0.32, -0.45), (-0.25, -0.1), (-0.26, 0.18), (-0.38, 0.12), (-0.44, 0.3)]


def leather():
    parts = [shape(TUNIC, 0.14, '#9a6236')]
    parts.append(shape([(-0.27, -0.42), (0.27, -0.42), (0.3, -0.47), (-0.3, -0.47)], 0.16, '#7a4a28'))
    parts.append(box((0, 0, -0.12), (0.54, 0.17, 0.08), '#4a2e1a'))  # belt
    parts.append(box((0, -0.06, -0.12), (0.1, 0.06, 0.1), GOLD, mat=METAL, bevel=0.01))
    parts.append(shape([(-0.12, 0.42), (0, 0.22), (0.12, 0.42), (0, 0.35)], 0.16, '#d9a86a'))  # collar
    for z in (0.3, 0.2, 0.1):  # lacing
        parts.append(box((0, -0.075, z), (0.07, 0.02, 0.015), STRING))
    return parts, (math.radians(-5), 0, math.radians(-18))


def mail():
    parts = [shape(TUNIC, 0.14, '#a3adb8', mat=METAL)]
    for z in [0.25, 0.12, -0.01, -0.14, -0.27, -0.4]:
        w = 0.5 if z > -0.05 else 0.6
        parts.append(box((0, -0.072, z), (w, 0.012, 0.012), '#6f7884', mat=METAL))
    for s in (1, -1):
        parts.append(sphere((s * 0.3, 0, 0.36), (0.16, 0.12, 0.11), '#8792a0', mat=METAL))
        parts.append(torus((s * 0.3, 0, 0.3), 0.13, 0.02, GOLD, rot=(0, s * 0.5, 0), mat=METAL, scale=(1, 0.8, 1)))
    parts.append(box((0, 0, -0.08), (0.52, 0.17, 0.07), '#5a3a22'))
    return parts, (math.radians(-5), 0, math.radians(-18))


def robe():
    body = [(-0.2, 0.44), (0.2, 0.44), (0.5, 0.25), (0.42, 0.05), (0.27, 0.15), (0.38, -0.55), (-0.38, -0.55), (-0.27, 0.15), (-0.42, 0.05), (-0.5, 0.25)]
    parts = [shape(body, 0.13, '#3b5bb5')]
    parts.append(shape([(-0.4, -0.5), (0.4, -0.5), (0.41, -0.57), (-0.41, -0.57)], 0.15, '#e8c04a', mat=METAL))  # hem
    parts.append(shape([(-0.035, 0.4), (0.035, 0.4), (0.05, -0.53), (-0.05, -0.53)], 0.15, '#e8c04a', mat=METAL))  # front trim
    parts.append(shape([(-0.25, 0.48), (0, 0.6), (0.25, 0.48), (0.15, 0.4), (-0.15, 0.4)], 0.18, '#2d4790', loc=(0, 0.03, 0)))  # hood
    star = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = 0.09 if i % 2 == 0 else 0.04
        star.append((math.cos(a) * r, math.sin(a) * r))
    parts.append(shape(star, 0.02, '#bfe6ff', loc=(0.16, -0.075, 0.15), mat=GLOW))
    return parts, (math.radians(-5), 0, math.radians(-18))


def shadowgarb():
    cloak = [(-0.18, 0.3), (0.18, 0.3), (0.42, -0.1), (0.36, -0.58), (0.1, -0.5), (-0.1, -0.58), (-0.36, -0.5), (-0.42, -0.1)]
    parts = [shape(cloak, 0.12, '#3d2c62')]
    hood = [(-0.24, 0.25), (-0.2, 0.52), (0, 0.68), (0.2, 0.52), (0.24, 0.25), (0, 0.18)]
    parts.append(shape(hood, 0.2, '#4a3874'))
    parts.append(shape([(-0.15, 0.27), (-0.12, 0.47), (0, 0.56), (0.12, 0.47), (0.15, 0.27), (0, 0.23)], 0.21, '#0e0a16', loc=(0, -0.01, 0)))
    for s in (1, -1):
        parts.append(sphere((s * 0.055, -0.12, 0.38), (0.03, 0.01, 0.018), '#c58bff', mat=GLOW))
    parts.append(box((0, 0, -0.05), (0.62, 0.15, 0.08), '#7a4fd0', rot=(0, 0.12, 0)))  # sash
    return parts, (math.radians(-5), 0, math.radians(-18))


# ------------------------------------------------------------------ rings
RING_POSE = (math.radians(12), 0, math.radians(40))


def band(color, minor=0.06):
    return torus((0, 0, 0), 0.32, minor, color, rot=(math.pi / 2, 0, 0), mat=METAL, seg=36, minor_seg=12)


def wolf():
    parts = [band('#c9d1da')]
    parts.append(ico((0, 0, 0.42), (0.13, 0.13, 0.11), '#7cc4ff', subdiv=1))
    for s in (1, -1):
        parts.append(cone((s * 0.13, 0, 0.42), 0.04, 0, 0.18, '#f4efe4', rot=(0, s * -0.6, 0), verts=6))
    parts.append(box((0, 0, 0.35), (0.22, 0.14, 0.06), '#9aa4ae', mat=METAL, bevel=0.015))
    return parts, RING_POSE


def bear():
    parts = [band('#b07a3a', minor=0.09)]
    parts.append(box((0, 0, 0.4), (0.3, 0.26, 0.1), '#8a5a28', mat=METAL, bevel=0.03))
    parts.append(ico((0, 0, 0.48), (0.16, 0.16, 0.1), '#e0304a', subdiv=1))
    for x in (-0.11, 0, 0.11):  # claw marks on the band
        parts.append(box((x, -0.1, 0.32), (0.025, 0.04, 0.07), '#5a3a1a'))
    return parts, RING_POSE


def serpent():
    parts = [band('#e2b13c')]
    parts.append(sphere((0.04, 0, 0.42), (0.1, 0.16, 0.08), '#3fae5a'))
    parts.append(sphere((0.04, -0.12, 0.42), (0.07, 0.08, 0.06), '#3fae5a'))
    for s in (1, -1):
        parts.append(sphere((0.04 + s * 0.045, -0.17, 0.46), (0.022, 0.022, 0.022), '#ffe14a', mat=GLOW))
    parts.append(tube([(0.04, -0.2, 0.42), (0.04, -0.27, 0.42), (0.07, -0.3, 0.42)], 0.008, '#e0304a'))
    parts.append(ico((0, 0.18, 0.36), (0.07, 0.07, 0.05), '#3fd27a', subdiv=1))
    return parts, RING_POSE


def falcon():
    parts = [band('#e2b13c')]
    parts.append(ico((0, 0, 0.43), (0.12, 0.12, 0.1), '#ffb62e', subdiv=1))
    parts.append(cyl((0, 0, 0.36), 0.11, 0.06, GOLD, mat=METAL))
    for s in (1, -1):
        wing = [(0, 0), (0.12, 0.08), (0.26, 0.1), (0.22, 0.03), (0.18, -0.02), (0.1, -0.05)]
        parts.append(shape([(s * (0.08 + x), z) for x, z in wing], 0.03, '#fff2d0', loc=(0, 0, 0.42)))
    return parts, RING_POSE


# ------------------------------------------------------------------ amulets
def chain(top=0.55, bottom=0.12, width=0.32):
    return tube([(-width, 0, top), (-width * 0.7, 0, top - 0.15), (-0.08, 0, bottom + 0.03), (0, 0, bottom),
                 (0.08, 0, bottom + 0.03), (width * 0.7, 0, top - 0.15), (width, 0, top)], 0.03, '#e0b54a')


def heart(scale):
    pts = []
    for i in range(24):
        t = i / 24 * 2 * math.pi
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x * scale, z * scale))
    return pts


def life():
    parts = [chain()]
    parts.append(shape(heart(0.0175), 0.06, GOLD, loc=(0, 0.01, -0.12), mat=METAL))
    parts.append(shape(heart(0.0135), 0.1, '#ff4d6a', loc=(0, 0, -0.12), smooth=False))
    return parts, (0, 0, math.radians(-10))


def rage():
    parts = [chain()]
    flame = [(0, 0.2), (0.07, 0.07), (0.15, 0.0), (0.13, -0.15), (0, -0.25), (-0.13, -0.15), (-0.15, 0.0), (-0.08, 0.04), (-0.05, 0.12)]
    parts.append(shape([(x * 1.3, z * 1.3) for x, z in flame], 0.06, IRON, loc=(0, 0.01, -0.15), mat=METAL))
    parts.append(shape(flame, 0.1, '#ff5a2a', loc=(0, 0, -0.15), mat=GLOW))
    parts.append(shape([(x * 0.5, z * 0.5 - 0.04) for x, z in flame], 0.12, '#ffd04a', loc=(0, 0, -0.15), mat=GLOW))
    return parts, (0, 0, math.radians(-10))


def fortune():
    parts = [chain()]
    parts.append(cyl((0, 0, -0.12), 0.22, 0.05, GOLD, rot=(math.pi / 2, 0, 0), verts=28, mat=METAL))
    parts.append(torus((0, -0.02, -0.12), 0.2, 0.02, '#c9902a', rot=(math.pi / 2, 0, 0), mat=METAL))
    parts.append(ico((0, -0.04, -0.12), (0.09, 0.05, 0.09), '#3fd27a', subdiv=1))
    for i in range(8):
        a = i * math.pi / 4
        parts.append(sphere((math.cos(a) * 0.15, -0.035, -0.12 + math.sin(a) * 0.15), (0.015, 0.01, 0.015), '#fff0b0', mat=METAL))
    return parts, (0, 0, math.radians(-10))


def fang():
    parts = [tube([(-0.32, 0, 0.55), (-0.22, 0, 0.35), (-0.06, 0, 0.12), (0, 0, 0.1), (0.06, 0, 0.12), (0.22, 0, 0.35), (0.32, 0, 0.55)], 0.022, '#4a342a')]
    # A curved tooth: wide at the root, sharp and hooked at the tip.
    left, right = [], []
    for i in range(12):
        t = i / 11
        x, z = 0.16 * t * t, 0.04 - 0.5 * t
        w = 0.085 * (1 - t) ** 0.8
        left.append((x - w, z))
        right.append((x + w, z))
    parts.append(shape(left + right[::-1], 0.1, '#f4efe4'))
    parts.append(cyl((0, 0, 0.06), 0.09, 0.06, IRON, mat=METAL))
    parts.append(sphere((0, -0.03, 0.12), (0.055, 0.05, 0.055), '#9a5cff', mat=GLOW))
    return parts, (0, 0, math.radians(-10))


ITEMS = {
    'bow': bow, 'crossbow': crossbow, 'staff': staff, 'blades': blades, 'longbow': longbow, 'shuriken': shuriken, 'tome': tome,
    'leather': leather, 'mail': mail, 'robe': robe, 'shadowgarb': shadowgarb,
    'wolf': wolf, 'bear': bear, 'serpent': serpent, 'falcon': falcon,
    'life': life, 'rage': rage, 'fortune': fortune, 'fang': fang,
}
PETS = ['bat', 'owl', 'frostling', 'salamander']

# ------------------------------------------------------------------ scene
models = {}
for name, make in ITEMS.items():
    if ONLY and name not in ONLY:
        continue
    parts, pose = make()
    obj = join(f'item_{name}', parts)
    obj.rotation_euler = pose
    models[name] = obj

if PETS_GLB and (not ONLY or ONLY & set(PETS)):
    bpy.ops.import_scene.gltf(filepath=PETS_GLB)
    for name in PETS:
        top = bpy.data.objects.get(name)
        if top and (not ONLY or name in ONLY):
            # glTF import turns Y-up back into Z-up; face the camera three-quarters.
            top.rotation_euler = (0, 0, math.radians(-20))
            models[name] = top
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.parent and o.parent.name in PETS:
            for slot in o.material_slots:
                if slot.material and 'glow' in slot.material.name:
                    slot.material.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.5

world = bpy.data.worlds.new('w')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.6, 0.75, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.25
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), math.radians(-10), math.radians(-35)))
bpy.context.object.data.energy = 3.2
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(-60), 0, math.radians(160)))
bpy.context.object.data.energy = 2.0
bpy.context.object.data.color = (0.75, 0.85, 1.0)
bpy.ops.object.camera_add(location=(0, -10, 0), rotation=(math.radians(90), 0, 0))
cam = bpy.context.object
cam.data.type = 'ORTHO'
scene.camera = cam

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 40
scene.cycles.use_denoising = False
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.render.use_freestyle = True
scene.render.line_thickness_mode = 'ABSOLUTE'
scene.render.line_thickness = SIZE / 150
lineset = scene.view_layers[0].freestyle_settings.linesets[0]
lineset.select_by_visibility = True
lineset.select_by_edge_types = True
lineset.select_silhouette = True
lineset.select_border = True
lineset.select_crease = False
lineset.linestyle = lineset.linestyle or bpy.data.linestyles.new('outline')
lineset.linestyle.color = (0.024, 0.01, 0.028)


def world_verts(obj):
    objs = [obj] + [c for c in obj.children_recursive]
    for o in objs:
        if o.type != 'MESH':
            continue
        deps = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
        for v in deps.data.vertices:
            yield deps.matrix_world @ v.co


def frame(obj):
    """Points the orthographic camera at `obj`, filling about 86 % of the square."""
    bpy.context.view_layer.update()
    xs, zs = [], []
    for co in world_verts(obj):
        xs.append(co.x)
        zs.append(co.z)
    cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    cam.location = (cx, -10, cz)
    cam.data.ortho_scale = max(max(xs) - min(xs), max(zs) - min(zs)) / 0.86


order = []
for name, obj in models.items():
    for other in models.values():
        hide = other is not obj
        for o in [other] + list(other.children_recursive):
            o.hide_render = hide
    frame(obj)
    scene.render.filepath = os.path.join(OUT, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    order.append(name)
    print('rendered', name)

if not ONLY:
    with open(os.path.join(OUT, 'order.json'), 'w') as f:
        json.dump([n for n in list(ITEMS) + PETS if n in order], f)
