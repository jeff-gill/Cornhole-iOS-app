"""Quaternius people (CC0) for the game: crowd models and avatar portraits.

Run from the repo root:  blender -b --python web/tools/blender/people.py [-- models|avatars]
  models:  web/assets/people/<name>.json   (glTF, buffers embedded; animations Idle, Clap, Jump; height ~1, feet at 0)
  avatars: web/assets/avatars/<id>.png     (head-and-shoulders portraits, transparent, 256 px)
Source: web/tools/blender/quaternius/{men,women}-fbx.zip. The flat-shaded (non "Smooth_") models match the game's look.
The game recolours the Skin, Hair, Shirt and Pants materials, so a few models make a varied crowd."""
import bpy, os, sys, math, json, base64, zipfile, tempfile, colorsys

ROOT = os.getcwd()
SRC = os.path.join(ROOT, "web/tools/blender/quaternius")
OUT_M = os.path.join(ROOT, "web/assets/people"); OUT_A = os.path.join(ROOT, "web/assets/avatars")
mode = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["models", "avatars"]
TMP = tempfile.mkdtemp()
for z in ("men-fbx.zip", "women-fbx.zip"):
    zipfile.ZipFile(os.path.join(SRC, z)).extractall(os.path.join(TMP, z[:-4]))
def fbx(name):
    for d, _, fs in os.walk(TMP):
        if name + ".fbx" in fs: return os.path.join(d, name + ".fbx")
    raise FileNotFoundError(name)

MODELS = ["Male_Casual", "Male_LongSleeve", "Male_Shirt", "Female_Casual", "Female_TankTop", "Female_Alternative", "Female_Dress"]
KEEP = {"Idle": "Idle", "Clapping": "Clap", "Jump": "Jump"}

def load(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx(name))
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for m in bpy.data.materials:  # the FBX import leaves every material fully transparent (alpha 0)
        b = m.node_tree.nodes.get("Principled BSDF") if m.use_nodes else None
        if b: b.inputs["Alpha"].default_value = 1.0; b.inputs["Roughness"].default_value = 0.75
    for a in list(bpy.data.actions):
        short = a.name.split("|")[-1].split("_", 1)[-1]
        if short in KEEP: a.name = KEEP[short]; a.use_fake_user = True
        else: bpy.data.actions.remove(a)
    return arm

def pack(path_gltf, out_json):
    g = json.load(open(path_gltf)); d = os.path.dirname(path_gltf)
    for b in g.get("buffers", []):
        bp = os.path.join(d, b["uri"]); b["uri"] = "data:application/octet-stream;base64," + base64.b64encode(open(bp, "rb").read()).decode(); os.remove(bp)
    json.dump(g, open(out_json, "w"), separators=(",", ":")); os.remove(path_gltf)

if "models" in mode:
    os.makedirs(OUT_M, exist_ok=True)
    for name in MODELS:
        arm = load(name)
        # scale so the character is 1 unit tall with feet at 0 (the game sizes it in feet)
        mesh = next(o for o in bpy.data.objects if o.type == "MESH")
        h = mesh.dimensions.z or 1
        arm.scale = [s / h for s in arm.scale]; bpy.ops.object.select_all(action="SELECT")
        p = os.path.join(TMP, name + ".gltf")
        bpy.ops.export_scene.gltf(filepath=p, export_format="GLTF_SEPARATE", export_animations=True, export_animation_mode="ACTIONS",
                                  export_apply=False, export_yup=True, export_materials="EXPORT", export_image_format="NONE")
        pack(p, os.path.join(OUT_M, name.lower() + ".json"))
        print("wrote model", name, os.path.getsize(os.path.join(OUT_M, name.lower() + ".json")))

# ── Avatar portraits: 25 people, about half women, each with its own skin, hair and shirt colours.
SKINS = ["#f6d2b8", "#eab894", "#d29a6c", "#a8714a", "#7a4e30", "#5a3620"]
HAIRS = ["#2a1c14", "#4a2e1a", "#8a5a2e", "#d9a94e", "#e8d29a", "#b03a1c", "#1c1c22", "#9aa0a8"]
SHIRTS = ["#c8102e", "#1f3a6e", "#ffc93a", "#2fbf71", "#ff8a1f", "#2f86ff", "#6a2c91", "#0fb5a5", "#ff2e88", "#ffffff", "#222222"]
AVATARS = []
for i in range(25):
    female = i % 2 == 1
    AVATARS.append(dict(id=f"p{i}", model=(["Female_Casual", "Female_TankTop", "Female_Alternative", "Female_Dress"] if female else ["Male_Casual", "Male_LongSleeve", "Male_Shirt"])[i // 2 % (4 if female else 3)],
                        skin=SKINS[(i * 7) % len(SKINS)], hair=HAIRS[(i * 5 + 1) % len(HAIRS)], shirt=SHIRTS[(i * 3) % len(SHIRTS)]))

def lin(h): h = h.lstrip("#"); return tuple((int(h[k:k + 2], 16) / 255) ** 2.2 for k in (0, 2, 4)) + (1,)

if "avatars" in mode:
    os.makedirs(OUT_A, exist_ok=True)
    for av in AVATARS:
        arm = load(av["model"])
        mesh = next(o for o in bpy.data.objects if o.type == "MESH")
        for m in mesh.data.materials:
            if not m or not m.use_nodes: continue
            b = m.node_tree.nodes.get("Principled BSDF")
            if not b: continue
            col = {"Skin": av["skin"], "Hair": av["hair"], "HairBase": av["hair"], "Shirt": av["shirt"]}.get(m.name)
            if col: b.inputs["Base Color"].default_value = lin(col)
            b.inputs["Roughness"].default_value = 0.7
        if "Idle" in bpy.data.actions:
            arm.animation_data_create(); arm.animation_data.action = bpy.data.actions["Idle"]; bpy.context.scene.frame_set(5)
        # frame the head and shoulders
        bpy.context.view_layer.update()
        from mathutils import Vector
        ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        bb = [ev.matrix_world @ Vector(c) for c in ev.bound_box]
        top, bot = max(v.z for v in bb), min(v.z for v in bb)
        H = top - bot; cz = top - H * 0.13
        sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = 48; sc.cycles.use_denoising = False
        sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 256; sc.view_settings.view_transform = "Standard"
        w = bpy.data.worlds.new("w"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.95, 1, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.9; sc.world = w
        bpy.ops.object.light_add(type="SUN", rotation=(math.radians(55), math.radians(-20), math.radians(-25))); bpy.context.active_object.data.energy = 3
        # characters face -Y in Blender after import; put the camera in front of the face
        # the characters face -Y: the camera stands in front, a little above eye level, looking slightly down
        bpy.ops.object.camera_add(location=(0, -H * 1.6, cz + H * 0.05), rotation=(math.radians(88), 0, 0))
        cam = bpy.context.active_object; cam.data.type = "ORTHO"; cam.data.ortho_scale = H * 0.36; sc.camera = cam
        sc.render.filepath = os.path.join(OUT_A, av["id"] + ".png"); bpy.ops.render.render(write_still=True); print("wrote avatar", av["id"], av["model"])
