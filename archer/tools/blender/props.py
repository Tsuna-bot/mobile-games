# Builds the landscape props made in Blender for the late chapters: the golden city
# (obelisk, lotus column, urn, brazier, sphinx), the celestial throne (marble column with
# its orb, star altar, broken arch) and the sky islands (cloud, floating isle).
#
#   blender -b -P tools/blender/props.py -- <out.glb> [preview.png]
#
# One top-level node per prop (its id). Child meshes use the shared vertex-colour
# material, glowing parts `prop_glow`. The game merges them with its generated props
# (one draw call per look): see blenderProp() in src/render/landscape.js.
# Blender axes: Z is up. Props stand on z = 0, about 1 unit wide.
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import Kit, join, root  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/props.glb'
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
K = Kit('prop')
sphere, ico, cone, cyl, box, torus, shape, tube = K.sphere, K.ico, K.cone, K.cyl, K.box, K.torus, K.shape, K.tube
GLOW = K.glow

SAND, SAND_DARK, SAND_LIGHT = '#d8b878', '#a8844a', '#f0dca8'
GOLD, GOLD_DARK = '#f2c444', '#c08a24'
LAPIS, RED = '#2f5fb8', '#c2402e'
MARBLE, MARBLE_SHADE = '#f4f2fa', '#c8c4dc'


def ring_bands(parts, z0, height, radius, colors, seg=16):
    """Painted bands stacked on a column."""
    h = height / len(colors)
    for i, c in enumerate(colors):
        parts.append(cyl((0, 0, z0 + h * (i + 0.5)), radius, h, c, verts=seg))


# ------------------------------------------------------------------ golden city
def obelisk():
    top = root('obelisk')
    parts = [box((0, 0, 0.12), (0.9, 0.9, 0.24), SAND_DARK, bevel=0.03), box((0, 0, 0.3), (0.72, 0.72, 0.12), SAND, bevel=0.02)]
    # Tapering shaft: a frustum with four sides.
    parts.append(cone((0, 0, 1.36), 0.42, 0.28, 2.0, SAND, rot=(0, 0, math.pi / 4), verts=4))
    for z in (0.75, 1.15, 1.55, 1.95):  # carved bands
        w = 0.42 - (z - 0.36) * 0.07
        parts.append(box((0, 0, z), (w * 1.44, w * 1.44, 0.035), SAND_DARK))
    for z, c in ((0.95, LAPIS), (1.35, RED), (1.75, LAPIS)):  # painted glyph tiles
        w = 0.42 - (z - 0.36) * 0.07
        for s in (1, -1):
            parts.append(box((0, s * w * 0.71, z), (w * 0.5, 0.02, 0.12), c))
            parts.append(box((s * w * 0.71, 0, z), (0.02, w * 0.5, 0.12), c))
    parts.append(cone((0, 0, 2.5), 0.28, 0.0, 0.32, GOLD, rot=(0, 0, math.pi / 4), verts=4))
    join('obelisk_body', parts, top)
    return top


def lotus_column():
    top = root('lotus_column')
    parts = [cyl((0, 0, 0.1), 0.48, 0.2, SAND_DARK, verts=16), cyl((0, 0, 0.26), 0.4, 0.12, SAND, verts=16)]
    parts.append(cyl((0, 0, 1.2), 0.3, 1.8, SAND, verts=16))
    ring_bands(parts, 0.4, 0.3, 0.315, [LAPIS, GOLD, RED], seg=16)
    ring_bands(parts, 1.75, 0.24, 0.315, [GOLD, LAPIS, GOLD], seg=16)
    # Lotus capital: a flaring bell of petals.
    parts.append(cone((0, 0, 2.3), 0.3, 0.52, 0.42, SAND_LIGHT, verts=16, smooth=True))
    for i in range(8):
        a = i * math.pi / 4
        parts.append(sphere((math.cos(a) * 0.4, math.sin(a) * 0.4, 2.33), (0.1, 0.1, 0.2), GOLD if i % 2 else '#4aa88a', seg=8, rings=6,
                            rot=(0, -0.5 * math.cos(a), 0)))
    parts.append(box((0, 0, 2.58), (0.86, 0.86, 0.14), SAND_DARK, bevel=0.02))
    join('lotus_column_body', parts, top)
    return top


def gold_urn():
    top = root('gold_urn')
    parts = [cyl((0, 0, 0.06), 0.32, 0.12, SAND_DARK, verts=14)]
    parts.append(cyl((0, 0, 0.16), 0.18, 0.08, GOLD_DARK, verts=14))
    parts.append(sphere((0, 0, 0.5), (0.36, 0.36, 0.34), GOLD, seg=14, rings=8))
    parts.append(cyl((0, 0, 0.88), 0.13, 0.18, GOLD, verts=14))
    parts.append(torus((0, 0, 0.98), 0.17, 0.035, GOLD_DARK, seg=20, minor_seg=8))
    parts.append(torus((0, 0, 0.5), 0.36, 0.025, LAPIS, seg=24, minor_seg=6))
    for s in (1, -1):
        parts.append(torus((s * 0.33, 0, 0.66), 0.1, 0.025, GOLD_DARK, rot=(math.pi / 2, 0, 0), seg=14, minor_seg=6))
    # Coins spilling around it.
    for i in range(6):
        a = i * 1.1 + 0.3
        r = 0.36 + 0.06 * (i % 2)
        parts.append(cyl((math.cos(a) * r, math.sin(a) * r, 0.02 + 0.03 * (i % 3)), 0.07, 0.025, GOLD, rot=(0.2 * (i % 2), 0.15, 0), verts=12))
    join('gold_urn_body', parts, top)
    return top


def brazier(name='brazier', metal=GOLD_DARK, rim=GOLD, flame=('#ff8a2a', '#ffe070')):
    top = root(name)
    parts = []
    for i in range(3):
        a = i * 2 * math.pi / 3
        parts.append(tube([(math.cos(a) * 0.36, math.sin(a) * 0.36, 0), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.55), (math.cos(a) * 0.24, math.sin(a) * 0.24, 0.85)], 0.04, metal))
        parts.append(sphere((math.cos(a) * 0.36, math.sin(a) * 0.36, 0.03), (0.06, 0.06, 0.04), metal, seg=8, rings=5))
    parts.append(cyl((0, 0, 0.5), 0.12, 0.06, rim, verts=12))
    bowl = sphere((0, 0, 0.92), (0.4, 0.4, 0.2), metal, seg=18, rings=10)
    parts.append(bowl)
    parts.append(torus((0, 0, 1.0), 0.4, 0.04, rim, seg=24, minor_seg=8))
    parts.append(cyl((0, 0, 1.01), 0.37, 0.03, '#3a2418', verts=18))  # embers bed
    join(f'{name}_body', parts, top)
    fire = []
    for i, (x, y, h, r) in enumerate([(0, 0, 0.55, 0.2), (0.12, 0.06, 0.38, 0.13), (-0.11, -0.05, 0.42, 0.14), (0.02, -0.13, 0.3, 0.1)]):
        fire.append(cone((x, y, 1.03 + h / 2), r, 0.0, h, flame[0], verts=8, smooth=True, mat=GLOW))
        fire.append(cone((x, y, 1.03 + h * 0.38), r * 0.55, 0.0, h * 0.7, flame[1], verts=8, smooth=True, mat=GLOW))
    join(f'{name}_glow', fire, top)
    return top


def sphinx():
    """A stylized guardian sphinx lying on a plinth (2 units long)."""
    top = root('sphinx')
    parts = [box((0, 0, 0.15), (1.0, 2.0, 0.3), SAND_DARK, bevel=0.04)]
    parts.append(box((0, 0.05, 0.38), (0.9, 1.9, 0.12), SAND, bevel=0.02))
    # Lion body lying down, facing -Y.
    parts.append(sphere((0, 0.35, 0.72), (0.38, 0.62, 0.3), SAND, seg=14, rings=10))
    parts.append(sphere((0, 0.78, 0.62), (0.34, 0.3, 0.22), SAND, seg=12, rings=8))  # haunch
    for s in (1, -1):
        parts.append(box((s * 0.2, -0.45, 0.5), (0.18, 0.75, 0.16), SAND, bevel=0.05))  # fore legs
        parts.append(sphere((s * 0.2, -0.82, 0.5), (0.1, 0.1, 0.08), SAND_LIGHT, seg=8, rings=6))  # paws
    parts.append(tube([(0.3, 0.95, 0.5), (0.42, 0.7, 0.45), (0.45, 0.4, 0.46)], 0.04, SAND))  # tail
    # Chest and head with the striped headdress.
    parts.append(sphere((0, -0.15, 0.95), (0.3, 0.26, 0.34), SAND, seg=12, rings=8))
    parts.append(sphere((0, -0.22, 1.42), (0.2, 0.2, 0.24), SAND_LIGHT, seg=14, rings=10))  # face
    head = [(-0.32, 0.0), (-0.36, -0.42), (-0.2, -0.3), (0.2, -0.3), (0.36, -0.42), (0.32, 0.0), (0.22, 0.26), (0, 0.32), (-0.22, 0.26)]
    parts.append(shape(head, 0.32, GOLD, loc=(0, -0.12, 1.45)))
    for i in range(4):  # lapis stripes
        z = 1.66 - i * 0.12
        parts.append(box((0, -0.12, z), (0.62 - i * 0.02, 0.34, 0.035), LAPIS))
    parts.append(box((0, -0.38, 1.36), (0.12, 0.06, 0.04), SAND_DARK))  # nose shadow
    for s in (1, -1):
        parts.append(sphere((s * 0.075, -0.4, 1.45), (0.035, 0.015, 0.02), '#2a1a2e', seg=8, rings=5))  # eyes
    parts.append(cone((0, -0.3, 1.82), 0.05, 0.0, 0.14, GOLD, rot=(-0.3, 0, 0), verts=6))  # cobra crest
    parts.append(cyl((0, -0.3, 1.18), 0.035, 0.24, LAPIS, verts=8))  # beard
    join('sphinx_body', parts, top)
    return top


# ------------------------------------------------------------------ celestial throne
def marble_column():
    top = root('marble_column')
    parts = [box((0, 0, 0.1), (0.86, 0.86, 0.2), MARBLE_SHADE, bevel=0.03), cyl((0, 0, 0.26), 0.36, 0.12, MARBLE, verts=14)]
    shaft = cyl((0, 0, 1.15), 0.27, 1.7, MARBLE, verts=14)
    parts.append(shaft)
    for i in range(10):  # flutes
        a = i * math.pi / 5
        parts.append(box((math.cos(a) * 0.268, math.sin(a) * 0.268, 1.15), (0.035, 0.035, 1.5), MARBLE_SHADE, rot=(0, 0, a)))
    for z in (0.4, 1.95):
        parts.append(torus((0, 0, z), 0.29, 0.035, GOLD, seg=16, minor_seg=5))
    parts.append(cyl((0, 0, 2.08), 0.36, 0.12, MARBLE, verts=14))
    parts.append(box((0, 0, 2.2), (0.8, 0.8, 0.12), MARBLE_SHADE, bevel=0.02))
    # A cradle of gold for the floating orb.
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        parts.append(tube([(math.cos(a) * 0.2, math.sin(a) * 0.2, 2.26), (math.cos(a) * 0.28, math.sin(a) * 0.28, 2.42), (math.cos(a) * 0.18, math.sin(a) * 0.18, 2.6)], 0.025, GOLD))
    join('marble_column_body', parts, top)
    orb = [sphere((0, 0, 2.62), (0.2, 0.2, 0.2), '#fff2b0', seg=12, rings=8, mat=GLOW), torus((0, 0, 2.62), 0.3, 0.012, '#ffe680', rot=(0.5, 0.3, 0), seg=20, minor_seg=4, mat=GLOW)]
    join('marble_column_glow', orb, top)
    return top


def star_altar():
    top = root('star_altar')
    parts = [cyl((0, 0, 0.08), 0.5, 0.16, MARBLE_SHADE, verts=8), cyl((0, 0, 0.22), 0.4, 0.12, MARBLE, verts=8)]
    parts.append(cone((0, 0, 0.6), 0.28, 0.2, 0.64, MARBLE, verts=8))
    parts.append(cyl((0, 0, 0.96), 0.32, 0.1, MARBLE_SHADE, verts=8))
    for i in range(8):
        a = i * math.pi / 4
        parts.append(box((math.cos(a) * 0.4, math.sin(a) * 0.4, 0.22), (0.06, 0.06, 0.13), GOLD, rot=(0, 0, a)))
    parts.append(torus((0, 0, 1.0), 0.3, 0.025, GOLD, seg=24, minor_seg=6))
    join('star_altar_body', parts, top)
    star = []
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = 0.32 if i % 2 == 0 else 0.13
        pts.append((math.cos(a) * r, math.sin(a) * r))
    star.append(shape(pts, 0.1, '#fff4c0', loc=(0, 0, 1.45), mat=GLOW))
    star.append(shape([(x * 0.55, z * 0.55) for x, z in pts], 0.14, '#ffffff', loc=(0, 0, 1.45), mat=GLOW))
    join('star_altar_glow', star, top)
    return top


def broken_arch():
    """Two marble pillars and a broken lintel (2 units wide)."""
    top = root('broken_arch')
    parts = []
    for x, h in ((-0.8, 2.4), (0.8, 1.7)):
        parts.append(box((x, 0, 0.1), (0.5, 0.5, 0.2), MARBLE_SHADE, bevel=0.03))
        parts.append(cyl((x, 0, 0.2 + h / 2), 0.17, h, MARBLE, verts=14))
        parts.append(torus((x, 0, 0.35), 0.18, 0.025, GOLD, seg=18, minor_seg=6))
        parts.append(box((x, 0, 0.26 + h), (0.44, 0.44, 0.1), MARBLE_SHADE, bevel=0.02))
    # The lintel still resting on the tall pillar, its other half fallen.
    parts.append(box((-0.45, 0, 2.78), (1.2, 0.4, 0.22), MARBLE, rot=(0, 0.08, 0), bevel=0.03))
    parts.append(box((-0.45, -0.205, 2.78), (1.0, 0.02, 0.06), GOLD, rot=(0, 0.08, 0)))
    parts.append(box((0.35, 0.3, 0.12), (0.9, 0.38, 0.22), MARBLE, rot=(0.1, 0, 0.5), bevel=0.03))
    parts.append(box((0.1, -0.35, 0.08), (0.3, 0.25, 0.16), MARBLE_SHADE, rot=(0, 0, 0.9), bevel=0.03))
    join('broken_arch_body', parts, top)
    return top


# ------------------------------------------------------------------ sky islands
def cloud():
    top = root('cloud')
    parts = []
    for x, y, z, r in [(0, 0, 0.35, 0.42), (0.42, 0.05, 0.28, 0.32), (-0.4, -0.04, 0.26, 0.34), (0.15, 0.2, 0.55, 0.3),
                       (-0.18, -0.15, 0.5, 0.28), (0.68, -0.05, 0.2, 0.2), (-0.7, 0.08, 0.18, 0.2)]:
        parts.append(sphere((x, y, z), (r, r * 0.85, r * 0.8), '#ffffff', seg=10, rings=6))
        parts.append(sphere((x, y + 0.02, z - r * 0.35), (r * 0.92, r * 0.78, r * 0.5), '#d8e4f8', seg=8, rings=4))
    join('cloud_body', parts, top)
    return top


def floating_isle():
    """A chunk of earth floating above the ground, grass on top, a little tree."""
    top = root('floating_isle')
    lift = 1.1
    parts = [cone((0, 0, lift - 0.45), 0.58, 0.05, 0.9, '#8a6a4a', rot=(math.pi, 0, 0), verts=9)]
    parts.append(cone((0.1, 0.05, lift - 0.62), 0.25, 0.0, 0.45, '#6a5038', rot=(math.pi, 0, 0.3), verts=7))
    parts.append(cyl((0, 0, lift + 0.04), 0.6, 0.1, '#6ab85a', verts=9))
    parts.append(cyl((0, 0, lift - 0.03), 0.6, 0.06, '#9a7a52', verts=9))
    for x, y in ((0.3, -0.2), (-0.3, 0.15), (0.05, 0.35)):
        parts.append(sphere((x, y, lift + 0.12), (0.09, 0.09, 0.07), '#4a9a4a', seg=8, rings=5))
    parts.append(cyl((-0.1, -0.05, lift + 0.35), 0.05, 0.5, '#7a5a3a', verts=7))
    parts.append(sphere((-0.1, -0.05, lift + 0.7), (0.3, 0.3, 0.25), '#5ab84a', seg=12, rings=8))
    parts.append(sphere((0.05, 0.05, lift + 0.8), (0.18, 0.18, 0.16), '#8ad86a', seg=10, rings=7))
    join('floating_isle_body', parts, top)
    # Glowing crystal hanging under it: what keeps it aloft.
    join('floating_isle_glow', [ico((0, 0, lift - 0.98), (0.07, 0.07, 0.16), '#a8f0ff', mat=GLOW)], top)
    return top


PROPS = [obelisk(), lotus_column(), gold_urn(), brazier(), sphinx(),
         marble_column(), star_altar(), broken_arch(),
         cloud(), floating_isle()]

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True,
                          export_yup=True, export_colors=True, export_attributes=False, export_animations=False,
                          export_texcoords=False, export_tangents=False)
print('exported', OUT)

if PREVIEW:
    scene = bpy.context.scene
    for i, p in enumerate(PROPS):
        p.location = ((i % 5 - 2) * 2.2, (i // 5) * 2.6, 0)
        p.rotation_euler = (0, 0, math.radians(-30 if p.name != 'sphinx' else 210))
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.5, 0.68, 1)
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), 0, math.radians(-30)))
    bpy.context.object.data.energy = 3.5
    bpy.ops.object.camera_add(location=(0, -11, 6.5), rotation=(math.radians(64), 0, 0))
    cam = bpy.context.object
    cam.data.lens = 30
    scene.camera = cam
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
