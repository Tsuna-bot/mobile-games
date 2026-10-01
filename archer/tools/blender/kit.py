# Small modelling kit shared by the Blender scripts: flat-coloured primitives (vertex
# colours on a few shared materials), joined into named meshes.
# Blender axes: -Y is forward (glTF +Z), Z is up. Units are metres.
import bmesh
import bpy
from mathutils import Matrix, Vector


def hex_rgba(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1.0,)


def make_material(name, emission=False, metallic=0.0, roughness=0.6):
    """A material whose colour is the vertex colour `Col` (glowing if `emission`)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes['Principled BSDF']
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        links.new(attr.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    return m


class Kit:
    def __init__(self, prefix='pet'):
        self.mat = make_material(prefix)
        self.glow = make_material(f'{prefix}_glow', emission=True)
        self.metal = make_material(f'{prefix}_metal', metallic=0.85, roughness=0.32)

    def paint(self, obj, color):
        """Gives every face corner of `obj` one flat colour."""
        mesh = obj.data
        if 'Col' not in mesh.color_attributes:
            mesh.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        rgba = hex_rgba(color)
        for item in mesh.color_attributes['Col'].data:
            item.color_srgb = rgba

    def finish(self, obj, color, smooth=True, mat=None):
        self.paint(obj, color)
        obj.data.materials.clear()
        obj.data.materials.append(mat or self.mat)
        for poly in obj.data.polygons:
            poly.use_smooth = smooth
        return obj

    def sphere(self, loc, scale, color, seg=14, rings=10, smooth=True, mat=None, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc, rotation=rot)
        obj = bpy.context.object
        obj.scale = scale
        return self.finish(obj, color, smooth, mat)

    def ico(self, loc, scale, color, subdiv=1, smooth=False, mat=None, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=1, location=loc, rotation=rot)
        obj = bpy.context.object
        obj.scale = scale
        return self.finish(obj, color, smooth, mat)

    def cone(self, loc, r1, r2, depth, color, rot=(0, 0, 0), verts=8, smooth=False, mat=None):
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
        return self.finish(bpy.context.object, color, smooth, mat)

    def cyl(self, loc, r, depth, color, rot=(0, 0, 0), verts=12, smooth=True, mat=None):
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
        obj = bpy.context.object
        obj.data.polygons.foreach_set('use_smooth', [smooth] * len(obj.data.polygons))
        self.finish(obj, color, smooth, mat)
        # Flat caps, smooth sides.
        for poly in obj.data.polygons:
            poly.use_smooth = smooth and len(poly.vertices) == 4
        return obj

    def box(self, loc, size, color, rot=(0, 0, 0), mat=None, bevel=0.0):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
        obj = bpy.context.object
        obj.scale = size
        if bevel:
            mod = obj.modifiers.new('bevel', 'BEVEL')
            mod.width = bevel
            mod.segments = 2
            with bpy.context.temp_override(active_object=obj, object=obj):
                bpy.ops.object.modifier_apply(modifier='bevel')
        return self.finish(obj, color, False, mat)

    def torus(self, loc, major, minor, color, rot=(0, 0, 0), seg=28, minor_seg=10, mat=None, scale=(1, 1, 1)):
        bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=seg, minor_segments=minor_seg, location=loc, rotation=rot)
        obj = bpy.context.object
        obj.scale = scale
        return self.finish(obj, color, True, mat)

    def shape(self, points, thickness, color, loc=(0, 0, 0), smooth=False, mat=None, rot=(0, 0, 0)):
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
        return self.finish(obj, color, smooth, mat)

    def tube(self, points, radius, color, mat=None, sides=8, smooth=True):
        """A round tube along a polyline of 3D points (a bow limb, a strap)."""
        curve = bpy.data.curves.new('tube', 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = radius
        curve.bevel_resolution = max(1, sides // 4 - 1)
        curve.use_fill_caps = True
        spline = curve.splines.new('POLY')
        spline.points.add(len(points) - 1)
        for p, co in zip(spline.points, points):
            p.co = (*co, 1)
        holder = bpy.data.objects.new('tube_curve', curve)
        bpy.context.collection.objects.link(holder)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(holder.evaluated_get(depsgraph))
        bpy.data.objects.remove(holder)
        bpy.data.curves.remove(curve)
        obj = bpy.data.objects.new('tube', mesh)
        bpy.context.collection.objects.link(obj)
        return self.finish(obj, color, smooth, mat)


def join(name, parts, parent=None, origin=(0, 0, 0)):
    """Joins `parts` into one mesh named `name`, origin at `origin`, parented to `parent`."""
    for p in parts:
        p.select_set(False)
    with bpy.context.temp_override(active_object=parts[0], selected_editable_objects=parts, selected_objects=parts):
        if len(parts) > 1:
            bpy.ops.object.join()
    obj = parts[0]
    with bpy.context.temp_override(active_object=obj, selected_editable_objects=[obj], selected_objects=[obj]):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
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
