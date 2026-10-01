# Fantasy armour for the anime heroes, fitted to each body in Blender: a shell is
# shrink-wrapped onto the hero's clothes (torso, forearms), thickened, painted per hero
# (steel plates, leather jerkin, robe, wraps), and given the body's skin weights so it
# bends exactly like the body. Writes one JSON per hero (positions in the hero's default
# pose, normals, colours, 4 joint names and weights per vertex), turned into a .glb by
# tools/blender/outfits.mjs.
#
#   blender -b -P tools/blender/outfits.py -- <heroes dir> <out dir> [ids]
#
# <heroes dir>: the hero .glb files decompressed for Blender (decompress.mjs).
# Blender axes: +Y is the hero's front, Z is up.
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SRC, OUT = argv[0], argv[1]
IDS = argv[2].split(',') if len(argv) > 2 and argv[2] else ['archer', 'assassin', 'ranger', 'mage', 'knight']
PREVIEW = argv[3] if len(argv) > 3 else None  # a folder: one front render per hero
os.makedirs(OUT, exist_ok=True)


def rgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


# Per hero: torso style and colours, bracers, and how far the shell sits off the clothes.
STYLES = {
    # Aren, archer: a green-brown leather jerkin laced at the front.
    'archer': {'torso': 'jerkin', 'main': '#7a4f2c', 'dark': '#4e3019', 'trim': '#3f6a34', 'accent': '#e8d8b0', 'bracers': '#5a3a22'},
    # Kaze, assassin: dark wrapped leather, a violet sash across the chest.
    'assassin': {'torso': 'wrap', 'main': '#2c2440', 'dark': '#18121f', 'trim': '#7a4fd0', 'accent': '#c0c8e0', 'bracers': '#231c33'},
    # Kael, ranger: a brown leather vest with buckles over the shirt.
    'ranger': {'torso': 'vest', 'main': '#5e4430', 'dark': '#3a2a1c', 'trim': '#8a6a40', 'accent': '#d8b060', 'bracers': '#4a3424'},
    # Ilian, mage: an embroidered robe top, gold trim and a glowing rune.
    'mage': {'torso': 'robe', 'main': '#2c2a6e', 'dark': '#1c1a4a', 'trim': '#e0b84a', 'accent': '#9ad8ff', 'bracers': '#e0b84a'},
    # Bran, knight: a steel breastplate in bands, gold edges.
    'knight': {'torso': 'plate', 'main': '#c8d2e2', 'dark': '#5a6478', 'trim': '#e0b84a', 'accent': '#a82a2a', 'bracers': '#b8c4d8'},
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def posed_body(objs):
    """One static mesh of the body and clothes as shown (skinned to the default pose), with
    the skin weights: hair and face left out. Clothes can be separate meshes."""
    dg = bpy.context.evaluated_depsgraph_get()
    copies = []
    for o in objs:
        if o.type != 'MESH' or not o.vertex_groups or o.name.startswith(('Hair', 'Face', 'Icosphere')):
            continue
        mesh = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        copy = bpy.data.objects.new(f'{o.name}_posed', mesh)
        copy.matrix_world = o.matrix_world
        bpy.context.collection.objects.link(copy)
        for g in o.vertex_groups:
            copy.vertex_groups.new(name=g.name)
        copies.append(copy)
    with bpy.context.temp_override(active_object=copies[0], selected_editable_objects=copies, selected_objects=copies):
        if len(copies) > 1:
            bpy.ops.object.join()
    return copies[0]


def tube(name, center, axis, radius, length, segments, rings):
    """An open cylinder around `axis` ('Z' or 'X'), starting at `center` and `length` long."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    grid = []
    for r in range(rings + 1):
        t = r / rings
        row = []
        for s in range(segments):
            a = s / segments * 2 * math.pi
            if axis == 'Z':
                co = (center.x + math.sin(a) * radius, center.y + math.cos(a) * radius, center.z + t * length)
            else:
                co = (center.x + t * length, center.y + math.cos(a) * radius, center.z + math.sin(a) * radius)
            row.append(bm.verts.new(co))
        grid.append(row)
    for r in range(rings):
        for s in range(segments):
            a, b = grid[r][s], grid[r][(s + 1) % segments]
            c, d = grid[r + 1][(s + 1) % segments], grid[r + 1][s]
            bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def apply(obj, mod):
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj], selected_editable_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def wrap(obj, target, offset, axis_inward=None):
    """Shrink-wraps `obj` onto `target` by casting each vertex inward along its normal."""
    # Normals point outward: make sure, then cast the other way.
    mod = obj.modifiers.new('wrap', 'SHRINKWRAP')
    mod.target = target
    mod.wrap_method = 'PROJECT'
    mod.use_negative_direction = True
    mod.use_positive_direction = False
    mod.offset = offset
    apply(obj, mod)
    smooth = obj.modifiers.new('smooth', 'SMOOTH')
    smooth.factor = 0.5
    smooth.iterations = 3
    apply(obj, smooth)


def paint(obj, colour_of):
    """Vertex colours from `colour_of(co, angle_front)`: angle 0 = front (+Y), ±π = back."""
    mesh = obj.data
    layer = mesh.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for loop in mesh.loops:
        co = mesh.vertices[loop.vertex_index].co
        layer.data[loop.index].color_srgb = (*colour_of(co), 1.0)


def thicken(obj, thickness):
    mod = obj.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = 1
    mod.use_rim = True
    apply(obj, mod)


def transfer_weights(obj, body):
    for g in body.vertex_groups:
        obj.vertex_groups.new(name=g.name)
    mod = obj.modifiers.new('dt', 'DATA_TRANSFER')
    mod.object = body
    mod.use_vert_data = True
    mod.data_types_verts = {'VGROUP_WEIGHTS'}
    mod.vert_mapping = 'POLYINTERP_NEAREST'
    mod.layers_vgroup_select_src = 'ALL'
    mod.layers_vgroup_select_dst = 'NAME'
    apply(obj, mod)


def torso_colour(style, spine, z0, z1):
    s = STYLES[style]
    main, dark, trim, accent = rgb(s['main']), rgb(s['dark']), rgb(s['trim']), rgb(s['accent'])
    kind = s['torso']

    def colour(co):
        a = math.atan2(co.x - spine.x, co.y - spine.y)  # 0 at the front
        t = (co.z - z0) / max(1e-6, z1 - z0)  # 0 at the waist, 1 at the armpits
        front = abs(a)
        edge = t < 0.07 or t > 0.93
        if kind == 'plate':
            if edge:
                return trim
            band = (t * 5) % 1
            if band < 0.12:
                return dark  # seams between the plates
            if front < 0.06:
                return dark  # the ridge down the middle
            return main
        if kind == 'jerkin':
            if edge:
                return dark
            if front < 0.11:
                # Lacing: cream crosses on the dark opening.
                return accent if (t * 18) % 2 < 0.55 and front < 0.08 else dark
            if 0.4 < front < 0.48:
                return trim  # stitched seams
            return main
        if kind == 'vest':
            if edge or front < 0.05:
                return dark
            if 0.1 < front < 0.2 and int(t * 4) % 2 == 0 and (t * 4) % 1 < 0.35:
                return accent  # buckles down the front
            if front > 2.5:
                return dark
            return main
        if kind == 'robe':
            if front < 0.13 or t > 0.9:
                return trim  # gold opening and collar
            if t < 0.06:
                return trim
            # A glowing rune on the chest, left side.
            if 0.35 < a < 0.65 and 0.55 < t < 0.75:
                return accent
            return main
        if kind == 'wrap':
            # A sash from the right shoulder to the left hip.
            if abs((a * 0.32) + (t - 0.5)) < 0.08 and front < 1.6:
                return trim
            if (t * 9 + a * 0.6) % 1 < 0.08:
                return dark  # the wraps
            return main
        return main
    return colour


def build(hero):
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f'{hero}.glb'))
    objs = list(bpy.data.objects)
    arm = next(o for o in objs if o.type == 'ARMATURE')
    target = posed_body(objs)
    body = target
    pose = arm.pose.bones
    world = arm.matrix_world

    def head(name):
        return world @ pose[name].head

    style = STYLES[hero]
    pieces = []

    # Torso: from just above the hips to just under the arms.
    spine, upper, hips = head('J_Bip_C_Spine'), head('J_Bip_C_UpperChest'), head('J_Bip_C_Hips')
    arm_z = min(head('J_Bip_L_UpperArm').z, head('J_Bip_R_UpperArm').z)
    # Down over the hips (the hoodie's hem), where the legs have not split yet.
    z0 = hips.z - 0.06
    z1 = arm_z - 0.035
    centre = Vector((spine.x, (spine.y + upper.y) / 2, z0))
    torso = tube('torso', centre, 'Z', 0.32, z1 - z0, 36, 15)
    wrap(torso, target, 0.012)
    paint(torso, torso_colour(hero, centre, z0, z1))
    thicken(torso, 0.008)
    pieces.append(torso)

    # Bracers on the forearms, from mid-arm to the wrist.
    for side in ('L', 'R'):
        elbow, wrist = head(f'J_Bip_{side}_LowerArm'), head(f'J_Bip_{side}_Hand')
        start = elbow.lerp(wrist, 0.42)
        length = (wrist - start).length * 0.92
        sign = 1 if wrist.x > elbow.x else -1
        piece = tube(f'bracer_{side}', Vector((start.x if sign > 0 else start.x - length, start.y, start.z)), 'X', 0.09, length, 14, 4)
        wrap(piece, target, 0.009)
        c, t = rgb(style['bracers']), rgb(style['trim'] if style['torso'] != 'plate' else style['dark'])
        paint(piece, lambda co, s=start, L=length, sg=sign: t if abs(((co.x - s.x) * sg) / L - 0.5) > 0.4 else c)
        thicken(piece, 0.006)
        pieces.append(piece)

    # One mesh, triangulated, weighted like the body.
    for p in pieces:
        p.select_set(True)
    with bpy.context.temp_override(active_object=pieces[0], selected_editable_objects=pieces, selected_objects=pieces):
        bpy.ops.object.join()
    armour = pieces[0]
    tri = armour.modifiers.new('tri', 'TRIANGULATE')
    apply(armour, tri)
    transfer_weights(armour, body)

    mesh = armour.data
    mesh.calc_normals_split() if hasattr(mesh, 'calc_normals_split') else None
    names = [g.name for g in armour.vertex_groups]
    used = {}
    positions, normals, colours, joints, weights, index = [], [], [], [], [], []
    layer = mesh.color_attributes['Col']
    # Not indexed: each corner its own vertex (flat colours, split normals).
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            loop = mesh.loops[li]
            v = mesh.vertices[loop.vertex_index]
            co = armour.matrix_world @ v.co
            n = (armour.matrix_world.to_3x3() @ poly.normal).normalized()
            groups = sorted(((g.weight, names[g.group]) for g in v.groups if g.weight > 0.001), reverse=True)[:4]
            total = sum(w for w, _ in groups) or 1
            j, w = [], []
            for weight, name in groups:
                used.setdefault(name, len(used))
                j.append(used[name])
                w.append(weight / total)
            while len(j) < 4:
                j.append(0)
                w.append(0)
            # glTF axes: Y up, Z toward Blender's -Y.
            positions += [co.x, co.z, -co.y]
            normals += [n.x, n.z, -n.y]
            colours += list(layer.data[li].color_srgb[:3])
            joints += j
            weights += w
            index.append(len(index))
    data = {'joints': sorted(used, key=used.get), 'positions': positions, 'normals': normals, 'colors': colours, 'jointIndices': joints, 'weights': weights}
    with open(os.path.join(OUT, f'{hero}.json'), 'w') as f:
        json.dump(data, f)
    print('outfit', hero, 'vertices', len(index), 'joints', len(used))
    if PREVIEW:
        preview(hero, armour, target)


def preview(hero, armour, target):
    """A front three-quarter render of the posed body wearing the armour."""
    scene = bpy.context.scene
    mat = bpy.data.materials.new('armour')
    mat.use_nodes = True
    attr = mat.node_tree.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    mat.node_tree.links.new(attr.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    armour.data.materials.clear()
    armour.data.materials.append(mat)
    for o in bpy.data.objects:
        if o.type == 'MESH' and o not in (armour,):
            o.hide_render = o is target
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), 0, math.radians(150)))
    bpy.ops.object.camera_add(location=(1.3, 2.4, 1.25), rotation=(math.radians(88), 0, math.radians(150)))
    scene.camera = bpy.context.object
    scene.camera.data.lens = 50
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = False
    scene.render.resolution_x, scene.render.resolution_y = 500, 700
    scene.render.filepath = os.path.join(PREVIEW, f'{hero}.png')
    bpy.ops.render.render(write_still=True)


for hero_id in IDS:
    build(hero_id)
