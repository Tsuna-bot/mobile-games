# Builds Aetherfall's four pets (bat, owl, frost spirit, salamander) as low-poly models.
#
#   blender -b -P tools/blender/pets.py -- <out.glb> [preview.png]
#
# Every pet is a top-level node named after its id with child meshes: `<id>_body`,
# `<id>_wingL` / `<id>_wingR` (pivot at the shoulder, flapped by the game around the
# forward axis), `<id>_tail` (swayed) and `<id>_glow` (unlit, glowing). Colours are
# vertex colours on one shared material, so each part is a single draw call.
# Blender axes: -Y is forward (glTF +Z), Z is up. Units are metres.
import math
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/pets.glb'
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def hex_rgba(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1.0,)


def make_material(name, emission=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes['Principled BSDF']
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.6
    if emission:
        links.new(attr.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    return m


MAT = make_material('pet')
GLOW = make_material('pet_glow', emission=True)


def paint(obj, color):
    """Gives every face corner of `obj` one flat colour."""
    mesh = obj.data
    if 'Col' not in mesh.color_attributes:
        mesh.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    layer = mesh.color_attributes['Col']
    rgba = hex_rgba(color)
    for item in layer.data:
        item.color_srgb = rgba


def finish(obj, color, smooth=True, mat=None):
    paint(obj, color)
    obj.data.materials.clear()
    obj.data.materials.append(mat or MAT)
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    return obj


def sphere(loc, scale, color, seg=14, rings=10, smooth=True, mat=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.scale = scale
    return finish(obj, color, smooth, mat)


def ico(loc, scale, color, subdiv=1, smooth=False, mat=None, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=1, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.scale = scale
    return finish(obj, color, smooth, mat)


def cone(loc, r1, r2, depth, color, rot=(0, 0, 0), verts=8, smooth=False, mat=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.object, color, smooth, mat)


def outline_shape(points, thickness, color, loc=(0, 0, 0), smooth=False, mat=None, rot=(0, 0, 0)):
    """A flat polygon in the XZ plane (points are (x, z)), given some thickness along Y."""
    mesh = bpy.data.meshes.new('shape')
    bm = bmesh.new()
    verts = [bm.verts.new((x, 0, z)) for x, z in points]
    face = bm.faces.new(verts)
    bmesh.ops.triangulate(bm, faces=[face])
    ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    moved = [v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved, vec=(0, thickness, 0))
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=(0, -thickness / 2, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new('shape', mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    return finish(obj, color, smooth, mat)


def join(name, parts, parent, origin=(0, 0, 0)):
    """Joins `parts` into one mesh named `name`, origin at `origin`, parented to `parent`."""
    for p in parts:
        p.select_set(False)
    with bpy.context.temp_override(active_object=parts[0], selected_editable_objects=parts, selected_objects=parts):
        if len(parts) > 1:
            bpy.ops.object.join()
    obj = parts[0]
    with bpy.context.temp_override(active_object=obj, selected_editable_objects=[obj], selected_objects=[obj]):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Move the origin without moving the geometry.
    offset = Vector(origin)
    obj.data.transform(Matrix.Translation(-offset))
    obj.location = offset
    obj.name = name
    obj.data.name = name
    obj.parent = parent
    return obj


def root(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    return obj


def mirrored(make):
    """Calls make(side) for side = 1 (left, +X) and -1 (right)."""
    return [make(1), make(-1)]


def eyes(x, y, z, r, iris, pupil='#141018'):
    parts = []
    for s in (1, -1):
        parts.append(sphere((s * x, y, z), (r, r * 0.6, r), iris, seg=12, rings=8))
        parts.append(sphere((s * x, y - r * 0.45, z - r * 0.05), (r * 0.62, r * 0.25, r * 0.7), pupil, seg=10, rings=6))
        parts.append(sphere((s * (x - r * 0.25), y - r * 0.62, z + r * 0.32), (r * 0.22, r * 0.1, r * 0.22), '#ffffff', seg=8, rings=5))
    return parts


# ------------------------------------------------------------------ bat
def build_bat():
    top = root('bat')
    body = [
        sphere((0, 0, 0), (0.13, 0.12, 0.125), '#5b3f9e'),
        sphere((0, -0.075, -0.03), (0.08, 0.06, 0.075), '#8a6fd8'),  # belly
    ]
    for s in (1, -1):
        body.append(cone((s * 0.07, 0, 0.13), 0.045, 0.0, 0.12, '#5b3f9e', rot=(0, s * -0.35, 0), verts=6))
        body.append(cone((s * 0.07, -0.014, 0.125), 0.026, 0.0, 0.09, '#f2a0c8', rot=(0, s * -0.35, 0), verts=6))
        body.append(cone((s * 0.03, -0.112, -0.03), 0.012, 0.0, 0.03, '#ffffff', rot=(math.pi, 0, 0), verts=5))  # fangs
        body.append(sphere((s * 0.05, -0.02, -0.12), (0.025, 0.025, 0.02), '#3a2870', seg=8, rings=6))  # feet
    body += eyes(0.048, -0.095, 0.025, 0.035, '#ffd84a')
    join('bat_body', body, top)

    def wing(s):
        # Scalloped membrane from the shoulder out to the tip.
        pts = [(0.0, 0.05), (0.12, 0.10), (0.26, 0.12), (0.36, 0.06), (0.31, -0.02), (0.25, -0.0), (0.19, -0.06),
               (0.13, -0.02), (0.07, -0.07), (0.0, -0.04)]
        pts = [(s * x, z) for x, z in pts]
        membrane = outline_shape(pts, 0.018, '#9a7aff', loc=(s * 0.09, 0.02, 0.02))
        # Dark finger bones along the top edge.
        edge = outline_shape([(s * x, z) for x, z in [(0.0, 0.065), (0.12, 0.115), (0.26, 0.135), (0.37, 0.065), (0.355, 0.05), (0.25, 0.11), (0.12, 0.09), (0.0, 0.04)]],
                             0.024, '#4a3290', loc=(s * 0.09, 0.02, 0.02))
        return join(f'bat_wing{"L" if s > 0 else "R"}', [membrane, edge], top, origin=(s * 0.09, 0.02, 0.02))
    mirrored(wing)
    return top


# ------------------------------------------------------------------ owl
def build_owl():
    top = root('owl')
    body = [
        sphere((0, 0, 0), (0.13, 0.12, 0.15), '#c9953f'),
        sphere((0, -0.06, -0.035), (0.095, 0.075, 0.1), '#f4e2b0'),  # belly
        sphere((0, -0.07, 0.06), (0.11, 0.06, 0.075), '#f7ead0'),  # face disc
        cone((0, -0.135, 0.035), 0.022, 0.0, 0.05, '#f08a2a', rot=(math.radians(100), 0, 0), verts=6),  # beak
    ]
    for s in (1, -1):
        body.append(cone((s * 0.075, 0.0, 0.155), 0.035, 0.0, 0.09, '#a8762c', rot=(0, s * -0.45, 0), verts=5))  # ear tufts
        body.append(sphere((s * 0.045, -0.02, -0.145), (0.03, 0.035, 0.018), '#f08a2a', seg=8, rings=6))  # feet
        for i in range(3):  # belly chevrons
            body.append(sphere((s * (0.025 + i * 0.012), -0.128 + i * 0.006, -0.03 - i * 0.035), (0.012, 0.006, 0.008), '#c9953f', seg=6, rings=4))
    body += eyes(0.048, -0.11, 0.065, 0.04, '#ffb81c')
    join('owl_body', body, top)

    def wing(s):
        feathers = []
        for i, (dx, dz, l) in enumerate([(0.0, 0.0, 0.2), (0.025, -0.035, 0.17), (0.05, -0.065, 0.13)]):
            feathers.append(sphere((s * (0.09 + l * 0.45 + dx), 0.01, 0.02 + dz), (l * 0.55, 0.025, 0.05), '#a8762c' if i else '#c9953f', seg=10, rings=6,
                                   rot=(0, s * -0.25, 0)))
        return join(f'owl_wing{"L" if s > 0 else "R"}', feathers, top, origin=(s * 0.1, 0.01, 0.03))
    mirrored(wing)
    return top


# ------------------------------------------------------------------ frost spirit
def build_frostling():
    top = root('frostling')
    body = [
        sphere((0, 0, 0), (0.12, 0.115, 0.13), '#cfefff', seg=16, rings=12),
        sphere((0, -0.04, -0.06), (0.09, 0.07, 0.07), '#a6dcf5'),
    ]
    # Wispy tail curling down.
    for i in range(3):
        r = 0.065 - i * 0.018
        body.append(sphere((0.02 * i, 0.03 + i * 0.035, -0.11 - i * 0.04), (r, r, r * 1.15), '#bfe8fa', seg=12, rings=8))
    body += eyes(0.045, -0.09, 0.02, 0.036, '#2f7fd0')
    for s in (1, -1):  # rosy cheeks
        body.append(sphere((s * 0.08, -0.085, -0.03), (0.022, 0.008, 0.013), '#9fd2ff', seg=8, rings=5))
    join('frostling_body', body, top)
    # Ice crown: glowing crystal spikes.
    crown = []
    for x, tilt, h in [(0, 0, 0.13), (0.055, -0.45, 0.095), (-0.055, 0.45, 0.095), (0.1, -0.85, 0.065), (-0.1, 0.85, 0.065)]:
        crown.append(cone((x, 0.01, 0.12 + h * 0.4), 0.03, 0.0, h, '#7fe0ff', rot=(0, tilt, 0), verts=4, mat=GLOW))
    join('frostling_glow', crown, top)

    def wing(s):
        shards = []
        for i, (ang, l) in enumerate([(0.55, 0.24), (0.15, 0.2), (-0.25, 0.14)]):
            c = Vector((s * (0.1 + math.cos(ang) * l * 0.5), 0.03, 0.03 + math.sin(ang) * l * 0.5))
            shards.append(ico(c, (l * 0.5, 0.012, 0.032), '#e6f8ff' if i == 0 else '#b4e6ff', rot=(0, -s * ang, 0)))
        return join(f'frostling_wing{"L" if s > 0 else "R"}', shards, top, origin=(s * 0.1, 0.03, 0.03))
    mirrored(wing)
    return top


# ------------------------------------------------------------------ salamander
def build_salamander():
    top = root('salamander')
    body = [
        sphere((0, 0.01, -0.01), (0.1, 0.13, 0.085), '#e2552a'),  # body
        sphere((0, -0.035, -0.045), (0.07, 0.09, 0.05), '#ffc25a'),  # belly
        sphere((0, -0.13, 0.05), (0.095, 0.09, 0.08), '#e2552a'),  # head
        sphere((0, -0.19, 0.035), (0.06, 0.05, 0.045), '#f26a35'),  # snout
    ]
    for s in (1, -1):
        for y in (-0.06, 0.08):  # legs
            body.append(sphere((s * 0.09, y, -0.07), (0.035, 0.03, 0.025), '#c23e1e', seg=8, rings=6))
        body.append(cone((s * 0.05, -0.08, 0.13), 0.022, 0.0, 0.07, '#ffc25a', rot=(-0.4, s * -0.4, 0), verts=5))  # horns
    for i in range(4):  # back spines
        body.append(cone((0, -0.06 + i * 0.05, 0.085 - i * 0.01), 0.018, 0.0, 0.05, '#ffc25a', rot=(-0.3, 0, 0), verts=4))
    body += eyes(0.05, -0.19, 0.085, 0.034, '#ffe14a')
    join('salamander_body', body, top)

    tail = []
    for i in range(5):
        r = 0.055 - i * 0.009
        tail.append(sphere((0, 0.14 + i * 0.05, -0.02 + i * 0.012 + (i * i) * 0.004), (r, r * 1.2, r), '#e2552a' if i < 4 else '#c23e1e', seg=10, rings=7))
    join('salamander_tail', tail, top, origin=(0, 0.12, -0.02))
    # Flame on the tail tip and on the head: glowing teardrops.
    flame = [
        cone((0, 0.36, 0.08), 0.045, 0.0, 0.13, '#ffb43a', rot=(-0.35, 0, 0), verts=7, smooth=True, mat=GLOW),
        cone((0, 0.355, 0.07), 0.028, 0.0, 0.09, '#fff1a0', rot=(-0.35, 0, 0), verts=7, smooth=True, mat=GLOW),
    ]
    flame_obj = join('salamander_flame', flame, top, origin=(0, 0.33, 0.03))
    flame_obj.parent = bpy.data.objects['salamander_tail']
    flame_obj.matrix_parent_inverse = bpy.data.objects['salamander_tail'].matrix_world.inverted()

    def wing(s):
        pts = [(0.0, 0.03), (0.1, 0.12), (0.22, 0.16), (0.2, 0.06), (0.15, 0.02), (0.11, -0.03), (0.0, -0.03)]
        pts = [(s * x, z) for x, z in pts]
        membrane = outline_shape(pts, 0.016, '#ff9a3a', loc=(s * 0.07, 0.0, 0.05), mat=GLOW)
        return join(f'salamander_wing{"L" if s > 0 else "R"}', [membrane], top, origin=(s * 0.07, 0.0, 0.05))
    mirrored(wing)
    return top


pets = [build_bat(), build_owl(), build_frostling(), build_salamander()]

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True,
                          export_yup=True, export_colors=True, export_attributes=False, export_animations=False,
                          export_texcoords=False, export_tangents=False)
print('exported', OUT)

if PREVIEW:
    # A contact sheet: the four pets side by side, front three-quarter view.
    for i, p in enumerate(pets):
        p.location = ((i - 1.5) * 0.78, 0, 0)
        p.rotation_euler = (0, 0, math.radians(-25))
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.32, 0.4, 0.55, 1)
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(55), 0, math.radians(-30)))
    bpy.context.object.data.energy = 3.5
    bpy.ops.object.camera_add(location=(0, -3.6, 0.7), rotation=(math.radians(80), 0, 0))
    cam = bpy.context.object
    cam.data.lens = 30
    scene.camera = cam
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 520
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
