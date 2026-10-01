# Fantasy armour for the anime heroes, fitted to each body in Blender: a shell is
# shrink-wrapped onto the hero's clothes (torso, forearms), thickened, textured per hero
# (steel plates and tabard, laced leather jerkin, buckled vest, embroidered robe, wraps
# and sash; painted at 2x and filtered, so lines stay clean) and given the body's skin
# weights so it bends exactly like the body.
#
#   blender -b -P tools/blender/outfits.py -- <heroes dir> <out dir> [ids] [preview dir]
#
# Writes <out dir>/<hero>.json (positions in the default pose, smooth normals, UVs,
# 4 joint names and weights per corner) and <hero>.png (the texture), packed into a .glb
# by tools/blender/outfits.mjs. Also a module: portraits.py dresses its heroes with it.
#
# <heroes dir>: the hero .glb files decompressed for Blender (decompress.mjs).
# Blender axes: +Y is the hero's front, Z is up.
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

TEX_W, TEX_H = 1024, 512
TORSO_V = 0.75  # the torso uses the bottom 3/4 of the texture, the bracers the top quarter


def rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


STYLES = {
    # Aren, archer: a leather jerkin laced at the front, green hem, stitched seams.
    'archer': {'torso': 'jerkin', 'main': '#7a4f2c', 'dark': '#4a2e18', 'trim': '#3f6a34', 'accent': '#ecdcb4', 'bracers': '#5a3a22'},
    # Kaze, assassin: dark leather wraps, a violet sash across the chest, a steel clasp.
    'assassin': {'torso': 'wrap', 'main': '#2e2642', 'dark': '#17111f', 'trim': '#7a4fd0', 'accent': '#c8d0e8', 'bracers': '#241c34'},
    # Kael, ranger: a brown leather vest with three buckled straps.
    'ranger': {'torso': 'vest', 'main': '#62472f', 'dark': '#36271a', 'trim': '#8a6a40', 'accent': '#e2bc66', 'bracers': '#4a3424'},
    # Ilian, mage: a night-blue robe, embroidered gold trim, a glowing rune.
    'mage': {'torso': 'robe', 'main': '#2a2870', 'dark': '#191748', 'trim': '#e2b84a', 'accent': '#9adcff', 'bracers': '#e2b84a'},
    # Bran, knight: steel plates in bands with rivets, a red tabard edged with gold.
    'knight': {'torso': 'plate', 'main': '#c9d3e3', 'dark': '#59637a', 'trim': '#e2b84a', 'accent': '#a8262a', 'bracers': '#b8c4d8'},
}


# ------------------------------------------------------------------ texture
def smooth(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def band(x, centre, half, soft):
    """1 inside |x - centre| < half, fading over `soft`."""
    return 1 - smooth(half, half + soft, np.abs(x - centre))


def mix(base, colour, mask):
    return base * (1 - mask[..., None]) + np.asarray(colour)[None, None, :] * mask[..., None]


def torso_texture(style, w, h):
    """The torso pattern; u around the body (0.5 = front), v from the waist (0) up."""
    s = STYLES[style]
    main, dark, trim, accent = rgb(s['main']), rgb(s['dark']), rgb(s['trim']), rgb(s['accent'])
    u, v = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / h)
    a = (u - 0.5) * 2 * math.pi  # 0 at the front, ±π at the back
    px = 1.5 / h  # about one pixel, for soft edges
    img = np.ones((h, w, 3)) * main
    # A little light from above and darker sides: the toon shading does the rest.
    img *= (0.9 + 0.12 * v)[..., None]
    kind = s['torso']
    if kind == 'plate':
        # Five overlapping lames: a dark seam and a bright lip under each.
        f = (v * 5) % 1
        img = mix(img, dark, band(f, 0.0, 0.015, px * 5) + band(f, 1.0, 0.015, px * 5))
        img = mix(img, main * 1.12, band(f, 0.05, 0.02, px * 5))
        # Rivets along the seams.
        rv = band((a / 0.35) % 1, 0.5, 0.06, 0.03) * band(f, 0.08, 0.03, 0.02)
        img = mix(img, dark * 0.8, rv)
        # Ridge down the middle, the tabard over the belly, gold edges.
        img = mix(img, main * 1.2, band(a, 0, 0.03, px * 6))
        tabard = band(a, 0, 0.42, px * 4) * (1 - smooth(0.55, 0.55 + px * 2, v))
        img = mix(img, accent, tabard)
        img = mix(img, trim, band(np.abs(a), 0.42, 0.025, px * 3) * (1 - smooth(0.57, 0.57 + px, v)) + band(v, 0.56, 0.012, px * 2) * band(a, 0, 0.44, px))
        img = mix(img, trim, band(v, 0.025, 0.025, px * 2) + band(v, 0.975, 0.025, px * 2))
    elif kind == 'jerkin':
        # Front opening with criss-cross lacing, stitched side seams, a green hem.
        opening = band(a, 0, 0.09, px * 4)
        img = mix(img, dark, opening)
        lace_y = (v * 16) % 1
        cross = np.minimum(np.abs(lace_y - (0.5 + a / 0.18 * 0.5)), np.abs(lace_y - (0.5 - a / 0.18 * 0.5)))
        img = mix(img, accent, (1 - smooth(0.05, 0.05 + 0.03, cross)) * band(a, 0, 0.085, px * 2))
        for seam in (0.48, 2.55):
            stitch = band(np.abs(a), seam, 0.008, px * 3) * band((v * 40) % 1, 0.5, 0.25, 0.05)
            img = mix(img, accent * 0.85, stitch)
            img = mix(img, dark, band(np.abs(a), seam + 0.03, 0.006, px * 3))
        img = mix(img, trim, 1 - smooth(0.08, 0.08 + px * 2, v))
        img = mix(img, accent * 0.85, band(v, 0.1, 0.004, px) * band((u * 160) % 1, 0.5, 0.25, 0.05))
        img = mix(img, dark, smooth(0.95, 0.95 + px * 2, v))
    elif kind == 'vest':
        img = mix(img, dark, band(a, 0, 0.05, px * 3))
        img = mix(img, dark * 1.1, smooth(2.3, 2.5, np.abs(a)))  # darker back panel
        for y in (0.28, 0.52, 0.76):
            strap = band(v, y, 0.025, px * 2) * band(a, 0, 0.32, px * 3)
            img = mix(img, dark * 0.9, strap)
            buckle = band(v, y, 0.04, px * 2) * band(a, 0.14, 0.04, px * 2)
            img = mix(img, accent, buckle)
            img = mix(img, dark * 0.7, band(v, y, 0.022, px) * band(a, 0.14, 0.022, px))
        img = mix(img, trim, band(v, 0.02, 0.02, px * 2) + band(v, 0.98, 0.02, px * 2))
    elif kind == 'robe':
        img = mix(img, dark, smooth(2.4, 2.8, np.abs(a)) * 0.5)
        trim_mask = band(a, 0, 0.13, px * 3) + band(v, 0.03, 0.03, px * 2) + band(v, 0.965, 0.035, px * 2)
        img = mix(img, trim, np.clip(trim_mask, 0, 1))
        # Embroidered diamonds down the trim.
        dy = (v * 22) % 1
        diamond = 1 - smooth(0.18, 0.18 + 0.05, np.abs(dy - 0.5) + np.abs(a) / 0.11 * 0.5)
        img = mix(img, dark, diamond * band(a, 0, 0.1, px))
        img = mix(img, main * 1.6, band(np.abs(a), 0.15, 0.006, px * 2))
        # The rune: a ring and a four-point star on the left of the chest.
        ru, rv = (a - 0.55) / 0.22, (v - 0.66) / 0.22 * 0.5
        r = np.sqrt(ru * ru + rv * rv)
        star = np.maximum(1 - smooth(0.04, 0.07, np.abs(ru) * 1.0 + np.abs(rv) * 3.2), 1 - smooth(0.04, 0.07, np.abs(ru) * 3.2 + np.abs(rv) * 1.0))
        glyph = np.clip(band(r, 0.33, 0.025, 0.02) + star * (r < 0.3), 0, 1)
        img = mix(img, accent, glyph)
    elif kind == 'wrap':
        f = (v * 10 + a * 0.55) % 1
        img = mix(img, dark, band(f, 0.0, 0.03, 0.02) + band(f, 1.0, 0.03, 0.02))
        sash = band(a * 0.3 + (v - 0.5), 0, 0.075, px * 3) * (1 - smooth(1.4, 1.6, np.abs(a)))
        img = mix(img, trim, sash)
        img = mix(img, trim * 1.35, band(a * 0.3 + (v - 0.5), 0.07, 0.006, px * 2) * (1 - smooth(1.4, 1.6, np.abs(a))))
        clasp = band(a, 0.0, 0.06, px * 2) * band(v, 0.5, 0.04, px * 2)
        img = mix(img, accent, clasp)
        img = mix(img, dark, band(v, 0.02, 0.02, px * 2) + band(v, 0.98, 0.02, px * 2))
    return img


def bracer_texture(style, w, h):
    s = STYLES[style]
    base, trim, dark = rgb(s['bracers']), rgb(s['trim'] if s['torso'] != 'plate' else s['dark']), rgb(s['dark'])
    u, v = np.meshgrid((np.arange(w) + 0.5) / w, (np.arange(h) + 0.5) / h)
    px = 1.5 / h
    img = np.ones((h, w, 3)) * base
    # v runs along the forearm (0 at mid-arm, 1 at the wrist): a band at each end.
    img = mix(img, trim, band(v, 0.07, 0.07, px * 2) + band(v, 0.93, 0.07, px * 2))
    img = mix(img, dark, band(v, 0.5, 0.01, px * 2) * band((u * 24) % 1, 0.5, 0.3, 0.05))
    return img


def texture(style):
    """The hero's texture (sRGB floats, H × W × 3), painted at twice the size and halved."""
    w, h = TEX_W * 2, TEX_H * 2
    th = int(h * TORSO_V)
    img = np.zeros((h, w, 3))
    img[:th] = torso_texture(style, w, th)
    img[th:] = bracer_texture(style, w, h - th)
    img = np.clip(img, 0, 1)
    return img.reshape(TEX_H, 2, TEX_W, 2, 3).mean(axis=(1, 3))


def save_texture(img, path):
    """Writes an sRGB float image (row 0 = bottom, as UV v = 0) to a PNG with Blender."""
    h, w, _ = img.shape
    image = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    rgba = np.concatenate([img, np.ones((h, w, 1))], axis=2).astype(np.float32)
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = path
    image.file_format = 'PNG'
    image.save()
    return image


# ------------------------------------------------------------------ geometry
def bake_rest(objs):
    """Makes the shown (default) pose the armature's rest pose, meshes unchanged on screen,
    so that new pieces weighted to it bend correctly when the pose changes."""
    arm = next(o for o in objs if o.type == 'ARMATURE')
    for o in objs:
        if o.type != 'MESH':
            continue
        mod = next((m for m in o.modifiers if m.type == 'ARMATURE'), None)
        if not mod:
            continue
        if o.data.shape_keys:
            # Expressions are not needed for the renders; they block applying the pose.
            o.shape_key_clear()
        apply(o, mod)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in objs:
        if o.type == 'MESH' and o.vertex_groups and not any(m.type == 'ARMATURE' for m in o.modifiers):
            m = o.modifiers.new('Armature', 'ARMATURE')
            m.object = arm
    return arm


def posed_body(objs):
    """One static mesh of the body and clothes as shown, with the skin weights: hair and
    face left out. Clothes can be separate meshes."""
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
    copies[0].hide_render = True
    copies[0].hide_viewport = True
    return copies[0]


def tube(name, start, axis, radius, length, segments, rings, v0, v1):
    """An open cylinder from `start` along unit vector `axis`. UV: u around (0.5 = the
    side facing +Y, the hero's front; the seam behind), v from v0 to v1 along it."""
    axis = axis.normalized()
    side = Vector((0, 1, 0)) if abs(axis.y) < 0.9 else Vector((1, 0, 0))
    front = (side - axis * side.dot(axis)).normalized()
    right = axis.cross(front)
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    grid = []
    for r in range(rings + 1):
        t = r / rings
        row = []
        for s in range(segments + 1):
            a = math.pi + s / segments * 2 * math.pi  # s = segments/2 faces the front
            co = start + axis * (t * length) + (front * math.cos(a) + right * math.sin(a)) * radius
            row.append(bm.verts.new(co))
        grid.append(row)
    for r in range(rings):
        for s in range(segments):
            quad = (grid[r][s], grid[r][s + 1], grid[r + 1][s + 1], grid[r + 1][s])
            face = bm.faces.new(quad)
            for loop, (du, dv) in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                loop[uv].uv = ((s + du) / segments, v0 + (r + dv) / rings * (v1 - v0))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def apply(obj, mod):
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj], selected_editable_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def wrap(obj, target, offset):
    """Shrink-wraps `obj` onto `target` by casting each vertex inward along its normal."""
    mod = obj.modifiers.new('wrap', 'SHRINKWRAP')
    mod.target = target
    mod.wrap_method = 'PROJECT'
    mod.use_negative_direction = True
    mod.use_positive_direction = False
    mod.offset = offset
    apply(obj, mod)
    smooth_mod = obj.modifiers.new('smooth', 'SMOOTH')
    smooth_mod.factor = 0.5
    smooth_mod.iterations = 4
    apply(obj, smooth_mod)


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


def make_armour(hero, objs, image=None, bind=False):
    """The hero's armour (torso + bracers) as one mesh weighted like the body, with its
    textured material. `objs`: the imported hero, in its default pose. `bind`: also deform
    it with the armature (after bake_rest(), for posed renders)."""
    arm = next(o for o in objs if o.type == 'ARMATURE')
    target = posed_body(objs)
    pose = arm.pose.bones

    def head(name):
        return arm.matrix_world @ pose[name].head

    pieces = []
    spine, upper, hips = head('J_Bip_C_Spine'), head('J_Bip_C_UpperChest'), head('J_Bip_C_Hips')
    arm_z = min(head('J_Bip_L_UpperArm').z, head('J_Bip_R_UpperArm').z)
    # From over the hips (the hoodie's hem, where the legs have not split yet) to the armpits.
    z0, z1 = hips.z - 0.06, arm_z - 0.035
    start = Vector((spine.x, (spine.y + upper.y) / 2, z0))
    torso = tube('torso', start, Vector((0, 0, 1)), 0.32, z1 - z0, 48, 18, 0.0, TORSO_V)
    wrap(torso, target, 0.012)
    thicken(torso, 0.008)
    pieces.append(torso)
    for side in ('L', 'R'):
        elbow, wrist = head(f'J_Bip_{side}_LowerArm'), head(f'J_Bip_{side}_Hand')
        begin = elbow.lerp(wrist, 0.42)
        piece = tube(f'bracer_{side}', begin, wrist - begin, 0.09, (wrist - begin).length * 0.92, 18, 5, TORSO_V, 1.0)
        wrap(piece, target, 0.009)
        thicken(piece, 0.006)
        pieces.append(piece)
    with bpy.context.temp_override(active_object=pieces[0], selected_editable_objects=pieces, selected_objects=pieces):
        bpy.ops.object.join()
    armour = pieces[0]
    armour.name = f'{hero}_outfit'
    apply(armour, armour.modifiers.new('tri', 'TRIANGULATE'))
    transfer_weights(armour, target)
    # Smooth shading; the rims of the plates stay crisp.
    for poly in armour.data.polygons:
        poly.use_smooth = True
    if hasattr(armour.data, 'use_auto_smooth'):
        armour.data.use_auto_smooth = True
        armour.data.auto_smooth_angle = math.radians(50)
    # Textured material (the renders); the game gets the same texture.
    image = image or save_texture(texture(hero), os.path.join(bpy.app.tempdir, f'{hero}_outfit.png'))
    mat = bpy.data.materials.new(f'{hero}_outfit')
    mat.use_nodes = True
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.interpolation = 'Cubic'
    mat.node_tree.links.new(tex.outputs['Color'], mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.75
    armour.data.materials.append(mat)
    if bind:
        mod = armour.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
        # Moves with the hero like the body does.
        armour.parent = arm
        armour.matrix_parent_inverse = arm.matrix_world.inverted()
    return armour


def export(hero, armour, out):
    """Writes the armour as JSON: one vertex per corner (UV seams, crisp rims)."""
    mesh = armour.data
    if hasattr(mesh, 'calc_normals_split'):
        mesh.calc_normals_split()
    names = [g.name for g in armour.vertex_groups]
    used = {}
    uv_layer = mesh.uv_layers.active.data
    positions, normals, uvs, joints, weights = [], [], [], [], []
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            loop = mesh.loops[li]
            v = mesh.vertices[loop.vertex_index]
            co = armour.matrix_world @ v.co
            n = (armour.matrix_world.to_3x3() @ loop.normal).normalized()
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
            # glTF axes: Y up, Z toward Blender's -Y; glTF v runs down the image.
            positions += [co.x, co.z, -co.y]
            normals += [n.x, n.z, -n.y]
            u, vv = uv_layer[li].uv
            uvs += [u, 1 - vv]
            joints += j
            weights += w
    data = {'joints': sorted(used, key=used.get), 'positions': positions, 'normals': normals, 'uvs': uvs, 'jointIndices': joints, 'weights': weights,
            'texture': f'{hero}.png'}
    with open(os.path.join(out, f'{hero}.json'), 'w') as f:
        json.dump(data, f)
    print('outfit', hero, 'corners', len(positions) // 3, 'joints', len(used))


def preview(hero, path):
    scene = bpy.context.scene
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), 0, math.radians(150)))
    bpy.ops.object.camera_add(location=(1.3, 2.4, 1.25), rotation=(math.radians(88), 0, math.radians(150)))
    scene.camera = bpy.context.object
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x, scene.render.resolution_y = 500, 700
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    src, out = argv[0], argv[1]
    ids = argv[2].split(',') if len(argv) > 2 and argv[2] else list(STYLES)
    preview_dir = argv[3] if len(argv) > 3 else None
    os.makedirs(out, exist_ok=True)
    for hero_id in ids:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=os.path.join(src, f'{hero_id}.glb'))
        objects = list(bpy.data.objects)
        img = save_texture(texture(hero_id), os.path.join(out, f'{hero_id}.png'))
        piece = make_armour(hero_id, objects, img)
        export(hero_id, piece, out)
        if preview_dir:
            preview(hero_id, os.path.join(preview_dir, f'{hero_id}.png'))
