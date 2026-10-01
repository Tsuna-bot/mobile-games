# Renders Aetherfall's app icon: Aren's bust in front of a glowing portal, on a night-blue
# sky. The face stays inside the centre circle so the icon also works as a maskable one.
#
#   blender -b -P tools/blender/icon.py -- <heroes dir> <out.png> [size]
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from portraits import bounds, load_hero, setup_scene  # noqa: E402

def emission_material(name, inner, outer, strength=1.0, radius=1.0, middle=None):
    """Glowing material: `inner` colour at the centre of the object fading to `outer`."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Strength'].default_value = strength
    coord = nodes.new('ShaderNodeTexCoord')
    grad = nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'SPHERICAL'
    mapping = nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (1 / radius,) * 3
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = outer
    ramp.color_ramp.elements[1].color = inner
    if middle:
        mid = ramp.color_ramp.elements.new(middle[0])
        mid.color = middle[1]
    links.new(coord.outputs['Object'], mapping.inputs['Vector'])
    links.new(mapping.outputs['Vector'], grad.inputs['Vector'])
    links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], emit.inputs['Color'])
    links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return m


def srgb(h, a=1.0):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (a,)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    src, out = argv[0], argv[1]
    size = int(argv[2]) if len(argv) > 2 else 1024
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cam = setup_scene(size)
    scene = bpy.context.scene
    scene.render.film_transparent = False
    scene.cycles.samples = 128

    hero = load_hero(os.path.join(src, 'archer.glb'), 'archer')
    meshes = [o for o in hero if o.type == 'MESH' and not o.hide_render]
    lo, hi = bounds([o for o in meshes if o.name.startswith(('Face', 'Hair'))])
    head_x, head_z = (lo.x + hi.x) / 2, (lo.z + hi.z) / 2
    head_h = hi.z - lo.z

    # Behind the hero: the sky (a big glowing plane), then the portal (stone ring, swirling light).
    bpy.ops.mesh.primitive_plane_add(size=6, location=(head_x, -1.5, head_z), rotation=(math.radians(90), 0, 0))
    sky = bpy.context.object
    sky.data.materials.append(emission_material('sky', srgb('#2f6f8f'), srgb('#141a3a'), strength=1.0, radius=3, middle=(0.6, srgb('#1f3560'))))

    ring_z = head_z + head_h * 0.05
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=head_h * 1.0, fill_type='NGON', location=(head_x, -0.6, ring_z), rotation=(math.radians(90), 0, 0))
    glow = bpy.context.object
    glow.data.materials.append(emission_material('portal', srgb('#f2fcff'), srgb('#1b4f9a'), strength=1.4, radius=head_h * 1.0, middle=(0.45, srgb('#5cc8ff'))))
    bpy.ops.mesh.primitive_torus_add(major_radius=head_h * 1.05, minor_radius=head_h * 0.09, major_segments=48, minor_segments=12,
                                     location=(head_x, -0.6, ring_z), rotation=(math.radians(90), 0, 0))
    ring = bpy.context.object
    stone = bpy.data.materials.new('stone')
    stone.use_nodes = True
    stone.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = srgb('#c9c4d6')
    stone.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    ring.data.materials.append(stone)
    for poly in ring.data.polygons:
        poly.use_smooth = True
    # Sparks of light around the portal.
    for i in range(14):
        a = i * 2.39996
        r = head_h * (1.18 + 0.12 * ((i * 37) % 7) / 7)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=head_h * (0.025 + 0.02 * (i % 3)),
                                              location=(head_x + math.cos(a) * r, -0.7, ring_z + math.sin(a) * r))
        bpy.context.object.data.materials.append(emission_material(f'spark{i}', srgb('#fffbe0'), srgb('#ffd27a'), strength=3.0, radius=head_h * 0.05))

    # Frame: the face a little above centre, inside the maskable safe circle.
    height = head_h * 2.35
    cam.location = (head_x, 3, head_z - head_h * 0.32)
    cam.data.ortho_scale = height
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('rendered icon', out)


if __name__ == '__main__':
    main()
