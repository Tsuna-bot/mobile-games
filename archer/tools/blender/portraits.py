# Renders bust portraits of the five heroes from their VRoid models.
#
#   blender -b -P tools/blender/portraits.py -- <heroes dir> <out dir> [size] [ids]
#
# <heroes dir> holds the hero .glb files decompressed for Blender (meshopt and
# quantization removed: tools/blender/decompress.mjs). Arms are lowered from the
# T-pose, the body turned three-quarters; flat anime lighting (the texture's own
# colour mostly emitted) with Freestyle outlines in the game's outline colour.
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from outfits import bake_rest, make_armour  # noqa: E402


# Lean of the head and turn of the body, per hero, for a little personality.
POSES = {
    'archer': {'turn': 18, 'tilt': 4},
    'assassin': {'turn': -20, 'tilt': -5},
    'ranger': {'turn': 15, 'tilt': -3},
    'mage': {'turn': -16, 'tilt': 5},
    'knight': {'turn': 12, 'tilt': 0},
}


def setup_scene(size):
    scene = bpy.context.scene
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.8, 0.95, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(55), math.radians(-15), math.radians(-30)))
    bpy.context.object.data.energy = 2.2
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(-50), 0, math.radians(150)))
    bpy.context.object.data.energy = 2.5
    bpy.context.object.data.color = (1.0, 0.9, 0.75)
    bpy.ops.object.camera_add(rotation=(math.radians(90), 0, math.radians(180)))
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    scene.camera = cam
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 128
    scene.cycles.use_denoising = False
    scene.cycles.transparent_max_bounces = 16
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = 'ABSOLUTE'
    scene.render.line_thickness = size / 560
    lineset = scene.view_layers[0].freestyle_settings.linesets[0]
    lineset.select_by_edge_types = True
    lineset.select_silhouette = True
    lineset.select_border = False
    lineset.select_crease = False
    lineset.linestyle = lineset.linestyle or bpy.data.linestyles.new('outline')
    lineset.linestyle.color = (0.024, 0.01, 0.028)
    # No outline on the face: around the eyes and lashes it reads as glasses.
    bare = bpy.data.collections.new('no_outline')
    scene.collection.children.link(bare)
    lineset.select_by_collection = True
    lineset.collection = bare
    lineset.collection_negation = 'EXCLUSIVE'
    return cam


def anime_materials():
    """Most of each texture's colour emitted: flat, bright anime shading that the lights only shape."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nodes, links = m.node_tree.nodes, m.node_tree.links
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        src = bsdf.inputs['Base Color'].links[0].from_socket if bsdf.inputs['Base Color'].links else None
        if src:
            links.new(src, bsdf.inputs['Emission Color'])
        else:
            bsdf.inputs['Emission Color'].default_value = bsdf.inputs['Base Color'].default_value
        bsdf.inputs['Emission Strength'].default_value = 0.55
        bsdf.inputs['Roughness'].default_value = 0.8
        bsdf.inputs['Specular IOR Level'].default_value = 0.1
        # The game's textures are small: smooth (cubic) magnification, not blocky texels.
        for node in nodes:
            if node.type == 'TEX_IMAGE':
                node.interpolation = 'Cubic'


def lower_arms(arm):
    """From the T-pose to arms hanging a little away from the body."""
    pose = arm.pose.bones
    for side in ('L', 'R'):
        upper = pose.get(f'J_Bip_{side}_UpperArm')
        hand = pose.get(f'J_Bip_{side}_Hand')
        if not upper or not hand:
            continue
        bpy.context.view_layer.update()
        head = upper.head.copy()
        current = (hand.head - head).normalized()
        out = 1 if current.x > 0 else -1
        target = Vector((out * 0.32, 0.05, -0.95)).normalized()
        rot = current.rotation_difference(target).to_matrix().to_4x4()
        upper.matrix = Matrix.Translation(head) @ rot @ Matrix.Translation(-head) @ upper.matrix
    bpy.context.view_layer.update()


def bounds(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        e = o.evaluated_get(dg)
        for v in e.data.vertices:
            co = e.matrix_world @ v.co
            for i in range(3):
                lo[i] = min(lo[i], co[i])
                hi[i] = max(hi[i], co[i])
    return lo, hi


def load_hero(path, hero, armour=True):
    """Imports a hero wearing their fitted armour (outfits.py), posed (arms down, turned,
    head tilted), with anime materials. Returns its objects."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    if armour:
        # The shown pose becomes the rest pose, so the armour bends with the arms.
        bake_rest(new)
        new.append(make_armour(hero, new, bind=True))
    bare = bpy.data.collections['no_outline']
    for o in new:
        if o.type == 'MESH' and o.name.startswith('Icosphere'):
            o.hide_render = True
        if o.type == 'MESH' and o.name.startswith('Face'):
            bare.objects.link(o)
    arm = next(o for o in new if o.type == 'ARMATURE')
    anime_materials()
    lower_arms(arm)
    pose = POSES.get(hero, {})
    head = arm.pose.bones.get('J_Bip_C_Head')
    if head and pose.get('tilt'):
        h = head.head.copy()
        rot = Matrix.Rotation(math.radians(pose['tilt']), 4, 'Y')
        head.matrix = Matrix.Translation(h) @ rot @ Matrix.Translation(-h) @ head.matrix
    arm.rotation_mode = 'XYZ'
    arm.rotation_euler = (0, 0, math.radians(pose.get('turn', 0)))
    bpy.context.view_layer.update()
    return new


def render(hero, cam, src, out):
    new = load_hero(os.path.join(src, f'{hero}.glb'), hero)
    meshes = [o for o in new if o.type == 'MESH' and not o.hide_render]
    face = next((o for o in meshes if o.name.startswith('Face')), meshes[0])
    lo, hi = bounds([o for o in meshes if o.name.startswith(('Face', 'Hair'))])
    # Bust: from the top of the hair down to mid-chest, the face a little above centre.
    top = hi.z + 0.02
    height = (hi.z - lo.z) * 2.5
    cam.location = ((lo.x + hi.x) / 2, 3, top - height / 2)
    cam.data.ortho_scale = height
    bpy.context.scene.render.filepath = os.path.join(out, f'{hero}.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', hero, face.name)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    src, out = argv[0], argv[1]
    size = int(argv[2]) if len(argv) > 2 else 512
    ids = argv[3].split(',') if len(argv) > 3 and argv[3] else ['archer', 'assassin', 'ranger', 'mage', 'knight']
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    camera = setup_scene(size)
    for hero_id in ids:
        render(hero_id, camera, src, out)
