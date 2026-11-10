"""Quaternius nature packs (CC0) for the game: trees, bushes, flowers, grass and rocks.

Run from the repo root:  blender -b --python web/tools/blender/nature.py -- <unzipped packs dir> [names...]
Output: web/assets/nature/<name>.json  (glTF with the buffer embedded; metres, base at the origin, flat colours)
Source zips: web/tools/blender/quaternius/ (uploaded by Jeff)."""
import bpy, os, sys, json, base64, tempfile

ROOT = os.getcwd(); OUT = os.path.join(ROOT, "web/assets/nature"); os.makedirs(OUT, exist_ok=True)
args = sys.argv[sys.argv.index("--") + 1:]
SRC, WANT = args[0], args[1:]
files = {}
for d, _, fs in os.walk(SRC):
    for f in fs:
        if f.endswith(".fbx"): files.setdefault(f[:-4], os.path.join(d, f))

def convert(name, path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)
    for m in bpy.data.materials:  # the FBX import leaves materials see-through; make them solid and matte
        b = m.node_tree.nodes.get("Principled BSDF") if m.use_nodes else None
        if b: b.inputs["Alpha"].default_value = 1.0; b.inputs["Roughness"].default_value = 0.85; b.inputs["Metallic"].default_value = 0
        m.blend_method = "OPAQUE"
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if len(meshes) > 1: bpy.ops.object.join()
    o = bpy.context.active_object
    # base at the origin
    zs = [(o.matrix_world @ v.co).z for v in o.data.vertices]; xs = [(o.matrix_world @ v.co).x for v in o.data.vertices]; ys = [(o.matrix_world @ v.co).y for v in o.data.vertices]
    o.location.z -= min(zs); o.location.x -= (min(xs) + max(xs)) / 2; o.location.y -= (min(ys) + max(ys)) / 2
    bpy.ops.object.transform_apply(location=True)
    p = os.path.join(tempfile.mkdtemp(), name + ".gltf")
    bpy.ops.export_scene.gltf(filepath=p, export_format="GLTF_SEPARATE", use_selection=True, export_apply=True, export_yup=True, export_image_format="NONE")
    g = json.load(open(p))
    for b in g.get("buffers", []):
        bp = os.path.join(os.path.dirname(p), b["uri"]); b["uri"] = "data:application/octet-stream;base64," + base64.b64encode(open(bp, "rb").read()).decode()
    out = os.path.join(OUT, name.lower() + ".json"); json.dump(g, open(out, "w"), separators=(",", ":"))
    print("wrote", name, round(max(zs) - min(zs), 2), "m tall,", os.path.getsize(out) // 1024, "KB")

for n in WANT or sorted(files):
    if n in files:
        try: convert(n, files[n])
        except Exception as e: print("FAILED", n, e)
    else: print("missing", n)
