"""Builds the game's stylized trees in Blender and exports them as glTF (embedded, saved as .json for web hosting).
Soft ambient-occlusion shading is baked into the vertex colours with Cycles, so the trees look rich at no runtime cost.

Run from the repo root:  blender -b --python web/tools/blender/trees.py
Output: web/assets/blender/tree_<kind>.json  (units: feet, base at the origin)"""
import bpy, bmesh, math, random, os
from mathutils import Vector, noise

OUT = os.path.join(os.getcwd(), "web/assets/blender")
os.makedirs(OUT, exist_ok=True)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 64
    sc.unit_settings.system = "NONE"

def lin(c):  # the colours below are picked as sRGB; glTF vertex colours are linear
    return tuple(max(0.0, x) ** 2.2 for x in c)

def paint(obj, fn):
    """Fill a 'Col' colour attribute (per corner) from fn(world_position, normal); fn returns sRGB."""
    me = obj.data
    attr = me.color_attributes.get("Col") or me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index]
            attr.data[li].color = (*lin(fn(obj.matrix_world @ v.co, poly.normal)), 1.0)
    me.color_attributes.active_color = attr

def blob(center, radius, seed, detail=2, squash=0.85, rough=0.22):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail, radius=radius, location=center)
    o = bpy.context.active_object
    random.seed(seed)
    off = Vector((random.random() * 50, random.random() * 50, random.random() * 50))
    for v in o.data.vertices:
        n = noise.noise(v.co * (1.6 / radius) + off)
        v.co *= 1 + rough * n
        v.co.z *= squash
    return o

def trunk(height, r0, r1, bend, seed):
    bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=r0, radius2=r1, depth=height, location=(0, 0, height / 2))
    o = bpy.context.active_object
    random.seed(seed)
    bx, by = (random.random() - 0.5) * bend, (random.random() - 0.5) * bend
    for v in o.data.vertices:
        t = v.co.z / height + 0.5
        v.co.x += bx * t * t; v.co.y += by * t * t
    return o

def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name
    bpy.ops.object.shade_flat()
    return o

def bake_ao(obj):
    """Bake ambient occlusion into an 'AO' colour attribute and multiply it into 'Col'."""
    me = obj.data
    ao = me.color_attributes.new("AO", "FLOAT_COLOR", "CORNER")
    me.color_attributes.active_color = ao
    mat = bpy.data.materials.new("bake"); mat.use_nodes = True; me.materials.append(mat)
    # a ground plane so the bottom of the canopy and trunk darken naturally
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0)); ground = bpy.context.active_object
    bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    sc = bpy.context.scene; sc.cycles.bake_type = "AO"; sc.render.bake.target = "VERTEX_COLORS"
    sc.world = bpy.data.worlds.new("w")
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    col = me.color_attributes["Col"]
    for i in range(len(col.data)):
        a = ao.data[i].color[0]; a = 0.35 + 0.65 * a  # keep it soft
        c = col.data[i].color; col.data[i].color = (c[0] * a, c[1] * a, c[2] * a, 1)
    me.color_attributes.remove(ao); me.color_attributes.active_color = me.color_attributes["Col"]
    bpy.data.objects.remove(ground)
    me.materials.clear()
    m = bpy.data.materials.new("tree"); m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]; bsdf.inputs["Roughness"].default_value = 0.9
    vc = m.node_tree.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
    m.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    me.materials.append(m)

def export(obj, name):
    bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True)
    path = os.path.join(OUT, name + ".gltf")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLTF_SEPARATE", use_selection=True, export_colors=True,
                              export_attributes=True, export_yup=True, export_apply=True)
    # pack the .bin into the JSON (base64) so it's one web-friendly .json file
    import json, base64
    g = json.load(open(path))
    for b in g.get("buffers", []):
        bp = os.path.join(OUT, b["uri"]); b["uri"] = "data:application/octet-stream;base64," + base64.b64encode(open(bp, "rb").read()).decode(); os.remove(bp)
    json.dump(g, open(os.path.join(OUT, name + ".json"), "w"), separators=(",", ":")); os.remove(path)
    print("wrote", name, os.path.getsize(os.path.join(OUT, name + ".json")), "bytes")

BARK = lambda p, n: (0.36 + 0.05 * noise.noise(p * 3), 0.24, 0.14)
def leaves(base, var):
    def f(p, n):
        k = noise.noise(p * 0.35) * var
        top = max(0.0, n.z) * 0.12  # sunlit tops a touch lighter
        return (base[0] + k * 0.5 + top * 0.6, base[1] + k + top, base[2] + k * 0.3 + top * 0.3)
    return f

def oak(seed):
    reset(); random.seed(seed)
    t = trunk(9, 0.75, 0.45, 1.2, seed); paint(t, BARK)
    parts = [t]
    for k in range(6):
        a = random.random() * math.tau; r = random.uniform(1.0, 3.0)
        c = (math.cos(a) * r, math.sin(a) * r, random.uniform(9, 13))
        b = blob(c, random.uniform(3.2, 4.6), seed * 10 + k); paint(b, leaves((0.22, 0.52, 0.18), 0.08)); parts.append(b)
    o = join(parts, "oak"); bake_ao(o); export(o, "tree_oak")

def maple(seed):
    reset(); random.seed(seed)
    t = trunk(11, 0.7, 0.4, 1.6, seed); paint(t, BARK)  # reaches up into the canopy
    parts = [t]
    for k in range(8):
        a = k / 8 * math.tau + random.random() * 0.4; r = random.uniform(2.5, 4.5)
        c = (math.cos(a) * r, math.sin(a) * r, random.uniform(8.5, 12))
        b = blob(c, random.uniform(2.6, 3.6), seed * 10 + k, squash=0.75); paint(b, leaves((0.30, 0.56, 0.16), 0.1)); parts.append(b)
    b = blob((0, 0, 10.8), 3.6, seed * 10 + 9, squash=0.8)  # covers the top of the trunk; paint(b, leaves((0.30, 0.58, 0.18), 0.1)); parts.append(b)
    o = join(parts, "maple"); bake_ao(o); export(o, "tree_maple")

def pine(seed):
    reset(); random.seed(seed)
    t = trunk(5, 0.55, 0.35, 0.3, seed); paint(t, BARK)
    parts = [t]
    for k in range(4):
        rad, h, z = 4.4 - k * 1.0, 5.2 - k * 0.6, 3.2 + k * 3.1
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=rad, radius2=0.05, depth=h, location=(0, 0, z + h / 2))
        c = bpy.context.active_object
        for v in c.data.vertices:
            if v.co.z < 0: v.co *= Vector((1 + 0.12 * noise.noise(v.co * 2 + Vector((k, 0, 0))), 1 + 0.12 * noise.noise(v.co * 2 + Vector((0, k, 0))), 1))
        paint(c, leaves((0.12, 0.36, 0.20), 0.06)); parts.append(c)
    o = join(parts, "pine"); bake_ao(o); export(o, "tree_pine")

if __name__ == "__main__":
    oak(3); maple(7); pine(11)
