"""Low-poly critter avatars in cornhole/tailgate gear, rendered with Cycles to transparent PNGs.
Run from the repo root:  blender -b --python web/tools/blender/critters.py   (writes web/assets/critters/<id>.png)
Each critter is built from simple shapes (flat-shaded ico spheres, cones), so the look matches the game's 3D art."""
import bpy, math, os
from mathutils import Vector

OUT = os.path.join(os.getcwd(), "web/assets/critters"); os.makedirs(OUT, exist_ok=True)
MATS = {}

def mat(rgb, rough=0.6, metal=0.0):
    key = (rgb, rough, metal)
    if key not in MATS:
        m = bpy.data.materials.new("m"); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*[c ** 2.2 for c in rgb], 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
        MATS[key] = m
    return MATS[key]

def hexc(h): h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

def ico(loc, scale, color, sub=2, rot=(0, 0, 0), flat=True, rough=0.6):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = scale; o.data.materials.append(mat(color, rough))
    if flat: bpy.ops.object.shade_flat()
    else: bpy.ops.object.shade_smooth()
    return o

def uv(loc, r, color, rough=0.25):  # smooth spheres for eyes
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=r, location=loc)
    o = bpy.context.active_object; o.data.materials.append(mat(color, rough)); bpy.ops.object.shade_smooth(); return o

def cone(loc, r1, r2, depth, color, rot=(0, 0, 0), verts=6):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object; o.data.materials.append(mat(color)); bpy.ops.object.shade_flat(); return o

def cyl(loc, r, depth, color, rot=(0, 0, 0), verts=24, rough=0.5):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object; o.data.materials.append(mat(color, rough)); bpy.ops.object.shade_smooth(); return o

WHITE, BLACK = (0.97, 0.97, 0.97), (0.05, 0.05, 0.06)

def eyes(y, z, dx, r=0.2, look=(0, 0)):
    for sx in (-1, 1):
        uv((sx * dx, y, z), r, WHITE)
        uv((sx * dx + look[0] * r * 0.3, y - r * 0.75, z + look[1] * r * 0.3), r * 0.55, BLACK, 0.1)
        uv((sx * dx - r * 0.18, y - r * 1.05, z + r * 0.2), r * 0.16, WHITE, 0.05)

def cap(color, brim=None, z=0.82, tilt=0.0):  # a ball cap with a brim and a button
    brim = brim or color
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1.02, location=(0, 0, z - 0.25))
    c = bpy.context.active_object; c.scale = (1.02, 1.02, 0.78)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="DESELECT"); bpy.ops.object.mode_set(mode="OBJECT")
    for v in c.data.vertices: v.select = v.co.z < -0.02
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.delete(type="VERT"); bpy.ops.object.mode_set(mode="OBJECT")
    c.data.materials.append(mat(color, 0.7)); bpy.ops.object.shade_smooth(); c.rotation_euler.x = tilt
    b = cyl((0, -0.95, z - 0.27), 0.62, 0.06, brim, rot=(math.radians(-8), 0, 0)); b.scale = (1, 1.1, 1)
    uv((0, 0, z + 0.53), 0.08, brim)

def headband(color, z=0.55):
    t = bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.09, location=(0, 0, z))
    o = bpy.context.active_object; o.scale = (1.0, 1.0, 1.0); o.data.materials.append(mat(color, 0.8)); bpy.ops.object.shade_smooth()

def shades(z, dx=0.36, y=-0.95, color=BLACK):
    for sx in (-1, 1):
        o = cyl((sx * dx, y, z), 0.24, 0.06, color, rot=(math.radians(90), 0, 0), rough=0.15); o.scale = (1.2, 1, 0.85)
    o = cyl((0, y - 0.01, z + 0.04), 0.03, 0.3, color, rot=(0, math.radians(90), 0))

def body():  # shoulders in a jersey, peeking up from the bottom
    pass

def scene_setup():
    bpy.ops.wm.read_factory_settings(use_empty=True); MATS.clear()
    sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = 48; sc.cycles.use_denoising = False
    sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 256
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.95, 1, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.9; sc.world = w
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(55), math.radians(-25), math.radians(-20))); bpy.context.active_object.data.energy = 3.2
    bpy.ops.object.light_add(type="AREA", location=(-3, -4, 1)); a = bpy.context.active_object; a.data.energy = 120; a.data.size = 4
    a.rotation_euler = (math.radians(70), 0, math.radians(-35))
    bpy.ops.object.camera_add(location=(0, -6.6, 0.25), rotation=(math.radians(89), 0, 0)); cam = bpy.context.active_object
    cam.data.lens = 70; sc.camera = cam

def jersey(color, trim):  # shoulders in a team jersey, cut off by the bottom of the frame
    o = ico((0, 0.25, -1.75), (1.55, 0.95, 0.85), color, sub=3, flat=False, rough=0.8)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.62, minor_radius=0.1, location=(0, -0.05, -1.0), rotation=(math.radians(-12), 0, 0))  # jersey collar
    c = bpy.context.active_object; c.scale = (1.15, 1.0, 1.0); c.data.materials.append(mat(trim, 0.8)); bpy.ops.object.shade_smooth()

def render(name):
    bpy.context.scene.render.filepath = os.path.join(OUT, name + ".png"); bpy.ops.render.render(write_still=True); print("wrote", name)

def build(c):
    """c: dict with head, muzzle, nose, ears ('pointy','round','long','tufts','none','floppy','horns'), extras, gear, jersey."""
    scene_setup()
    H = hexc(c["head"]); M = hexc(c.get("muzzle", c["head"])); N = hexc(c.get("nose", "#1a1a1e"))
    jersey(hexc(c["jersey"][0]), hexc(c["jersey"][1]))
    sx_, sy_, sz_ = c.get("shape", (1, 0.95, 0.92))
    ico((0, 0, 0), (sx_, sy_, sz_), H)
    ec = hexc(c.get("ear", c["head"])); ei = hexc(c.get("earin", c.get("muzzle", c["head"])))
    ears = c.get("ears", "round")
    for sx in (-1, 1):
        if ears == "pointy": cone((sx * 0.6, 0.05, 0.95), 0.34, 0.02, 0.8, ec, rot=(0, sx * math.radians(-20), 0), verts=4); cone((sx * 0.6, -0.06, 0.9), 0.18, 0.01, 0.55, ei, rot=(0, sx * math.radians(-20), 0), verts=4)
        elif ears == "round": ico((sx * 0.78, 0.1, 0.78), (0.3, 0.2, 0.3), ec); ico((sx * 0.78, -0.03, 0.78), (0.17, 0.08, 0.17), ei)
        elif ears == "long": ico((sx * 0.36, 0.1, 1.35), (0.22, 0.15, 0.72), ec, rot=(0, sx * math.radians(-12), 0)); ico((sx * 0.36, -0.02, 1.35), (0.12, 0.06, 0.58), ei, rot=(0, sx * math.radians(-12), 0))
        elif ears == "tufts": cone((sx * 0.6, 0.0, 0.95), 0.2, 0.02, 0.55, ec, rot=(0, sx * math.radians(-22), 0), verts=4)
        elif ears == "floppy": ico((sx * 0.95, 0.05, 0.15), (0.24, 0.16, 0.55), ec, rot=(0, sx * math.radians(25), 0))
        elif ears == "horns": cone((sx * 0.45, 0.05, 1.0), 0.12, 0.03, 0.45, hexc("#f1e6c8"), rot=(0, sx * math.radians(-25), 0), verts=8); ico((sx * 0.92, 0.05, 0.45), (0.28, 0.12, 0.16), ec)
    for ex in c.get("extras", []):
        kind = ex[0]
        if kind == "mask": ico((0, -0.72, 0.2), (0.85, 0.3, 0.26), hexc(ex[1]))
        if kind == "patches": [ico((sx * 0.36, -0.8, 0.18), (0.26, 0.12, 0.3), hexc(ex[1])) for sx in (-1, 1)]
        if kind == "mane": [ico((math.cos(a) * 0.95, 0.15, math.sin(a) * 0.95), (0.38, 0.3, 0.38), hexc(ex[1])) for a in [k / 10 * math.tau for k in range(10)]]
        if kind == "stripes": [ico((sx * 0.85, -0.2, 0.25 - k * 0.25), (0.14, 0.4, 0.05), hexc(ex[1]), sub=1) for sx in (-1, 1) for k in range(2)] + [ico((dx, -0.3, 0.85), (0.06, 0.4, 0.14), hexc(ex[1]), sub=1) for dx in (-0.25, 0, 0.25)]
        if kind == "spots": [ico((x, -0.82, z), (0.16, 0.08, 0.14), hexc(ex[1]), sub=1) for x, z in ((-0.55, 0.45), (0.5, 0.15), (0.2, 0.6))]
        if kind == "cheeks": [ico((sx * 0.58, -0.68, -0.25), (0.18, 0.06, 0.11), hexc(ex[1])) for sx in (-1, 1)]
        if kind == "brow": ico((0, -0.82, 0.36), (0.78, 0.26, 0.2), hexc(ex[1]))  # a heavy brow ridge
        if kind == "tuft": ico((0, -0.1, 0.95), (0.28, 0.22, 0.25), hexc(ex[1]))
        if kind == "spikes":  # quills fanning out around the back of the head
            for k in range(11):
                a = -0.25 + k / 10 * (math.pi + 0.5)
                d = Vector((math.cos(a), 0.25, math.sin(a))).normalized()
                cone(tuple(d * 0.9 + Vector((0, 0.25, 0.05))), 0.2, 0.01, 0.7, hexc(ex[1]), rot=(0, math.atan2(d.x, d.z), 0), verts=4)
        if kind == "shell": ico((0, 0.6, 0.4), (0.9, 0.5, 0.7), hexc(ex[1]))
        if kind == "antlers": [cone((sx * 0.45, 0.05, 1.15), 0.06, 0.03, 0.6, hexc(ex[1]), rot=(0, sx * math.radians(-25), 0), verts=6) for sx in (-1, 1)] + [cone((sx * 0.68, 0.05, 1.3), 0.05, 0.02, 0.35, hexc(ex[1]), rot=(0, sx * math.radians(-60), 0), verts=6) for sx in (-1, 1)]
    beak = c.get("beak")
    if beak == "swan":  # a long orange bill sticking well out of the face, with the black knob at its base
        b = cone((0, -1.08, -0.42), 0.19, 0.05, 0.75, hexc(c.get("beakc", "#ff7a1a")), rot=(math.radians(-140), 0, 0), verts=10); b.scale = (1.1, 1, 0.75)
        ico((0, -0.9, -0.08), (0.2, 0.12, 0.14), BLACK)
    elif beak: cone((0, -0.95, -0.15), 0.18 if beak == "duck" else 0.13, 0.02 if beak != "duck" else 0.12, 0.38, hexc(c.get("beakc", "#ffb02e")), rot=(math.radians(-95), 0, 0), verts=4 if beak != "duck" else 8)
    else:
        mz = c.get("muzzlesize", (0.48, 0.45, 0.33))
        ico((0, -0.74, -0.28), mz, M)
        if c.get("snout"): ico((0, -1.12, -0.25), (0.3, 0.12, 0.22), hexc(c["snout"])); [uv((sx * 0.1, -1.23, -0.25), 0.05, BLACK) for sx in (-1, 1)]
        else: ico((0, -1.16, -0.16), (0.13, 0.09, 0.1), N, sub=1)
    ey = c.get("eyes", (-0.8, 0.18, 0.35, 0.18))
    eyes(*ey)
    if c.get("fem"):  # eyelashes, rosy cheeks and a bow
        y, z, dx, r = ey
        for sx in (-1, 1):
            for k in (-1, 0, 1):
                a = sx * (0.9 + k * 0.32)
                cone((sx * dx + math.sin(a) * r * 1.0, y - r * 0.55, z + math.cos(a) * r * 1.0 + 0.02), 0.035, 0.005, 0.2, BLACK,
                     rot=(math.radians(-15), a, 0), verts=4)
        if not any(e[0] == "cheeks" for e in c.get("extras", [])):
            for sx in (-1, 1): ico((sx * 0.56, -0.7, -0.2), (0.16, 0.05, 0.1), hexc("#ff9ab0"))
        bc = hexc(c.get("bow", "#ff2e88")); bx, bz = c.get("bowpos", (0.74, 0.42))
        for sx in (-1, 1): cone((bx + sx * 0.22, -0.72, bz), 0.22, 0.02, 0.4, bc, rot=(0, math.radians(-90 * sx), 0), verts=4)  # tips meet in the middle
        uv((bx, -0.76, bz), 0.1, bc)
    gear = c.get("gear")
    gear = None  # no hats, headbands or sunglasses: every critter shows its face
    if gear:
        g = gear[0]
        if g == "cap": cap(hexc(gear[1]), hexc(gear[2]), z=c.get("capz", 0.8))
        if g == "headband": headband(hexc(gear[1]), z=c.get("bandz", 0.5))
        if g == "shades": shades(ey[1] + 0.02, dx=ey[2], y=ey[0] - 0.2, color=hexc(gear[1]))
        if g == "visor": b = cyl((0, -0.9, 0.62), 0.6, 0.05, hexc(gear[1]), rot=(math.radians(-10), 0, 0)); b.scale = (1, 1.1, 1); headband(hexc(gear[1]), z=0.6)
    render(c["id"])

NAVY, GOLD, RED, WHITEH, GREEN, BLUE, ORANGE, PURPLE, TEAL, PINK, BLACKH = "#1f3a6e", "#ffc93a", "#c8102e", "#ffffff", "#2fbf71", "#2f86ff", "#ff8a1f", "#6a2c91", "#0fb5a5", "#ff2e88", "#222222"
CRITTERS = [
    dict(id="fox", fem=True, bow="#ff2e88", head="#e8762b", muzzle="#fbefdc", ears="pointy", earin="#fbefdc", jersey=(NAVY, GOLD), gear=("shades", BLACKH)),
    dict(id="bear", head="#8a5a36", muzzle="#d9b48a", ears="round", earin="#d9b48a", jersey=(GREEN, WHITEH), gear=("headband", GOLD)),
    dict(id="raccoon", head="#8e949c", muzzle="#f4f4f4", ears="pointy", earin="#2a2c30", extras=[("mask", "#2a2c30")], jersey=(PURPLE, GOLD), gear=("headband", RED)),
    dict(id="bunny", fem=True, bow="#ff2e88", bowpos=(0.6, 0.62), head="#f2f2f4", muzzle="#ffffff", nose="#ff8aa8", ears="long", earin="#ffb8c8", extras=[("cheeks", "#ffb8c8")], jersey=(TEAL, WHITEH), gear=("headband", RED), bandz=0.6),
    dict(id="owl", fem=True, bow="#ff2e88", bowpos=(0.6, 0.5), head="#9a6a3c", ears="tufts", beak="owl", extras=[("patches", "#f1dcb0")], eyes=(-0.95, 0.15, 0.38, 0.24), jersey=(RED, NAVY)),
    dict(id="frog", head="#4cb84a", muzzle="#bfe8a0", ears="none", shape=(1.15, 0.95, 0.8), muzzlesize=(0.85, 0.5, 0.3), eyes=(-0.55, 0.62, 0.48, 0.22), jersey=(ORANGE, WHITEH)),
    dict(id="cat", fem=True, bow="#ffc93a", head="#f0a24a", muzzle="#fff4e4", ears="pointy", earin="#ffb8c8", nose="#ff8aa8", extras=[("stripes", "#c46a1e")], jersey=(BLUE, WHITEH), gear=("cap", NAVY, GOLD)),
    dict(id="pup", head="#c8955a", muzzle="#f4e4c8", ears="floppy", ear="#7a4a26", jersey=(RED, WHITEH), gear=("headband", BLUE)),
    dict(id="panda", fem=True, bow="#ff2e88", head="#f6f6f6", muzzle="#ffffff", ears="round", ear="#1c1c1e", earin="#1c1c1e", extras=[("patches", "#1c1c1e")], jersey=(GREEN, GOLD), gear=("cap", RED, WHITEH)),
    dict(id="pig", head="#ffb3c1", ears="pointy", earin="#ff8aa8", snout="#ff8aa8", jersey=(NAVY, WHITEH), gear=("shades", "#2f86ff")),
    dict(id="lion", head="#e8b04a", muzzle="#f8e4b8", ears="round", extras=[("mane", "#b8661e")], jersey=(GOLD, NAVY), gear=("headband", WHITEH)),
    dict(id="tiger", fem=True, bow="#ff2e88", head="#f08a2a", muzzle="#ffffff", ears="round", earin="#ffffff", extras=[("stripes", "#2a1a10")], jersey=(BLACKH, ORANGE), gear=("cap", ORANGE, BLACKH)),
    dict(id="koala", head="#9aa0a8", muzzle="#c8ccd2", ears="round", ear="#b8bec6", earin="#f4f4f4", nose="#2a2c30", jersey=(TEAL, GOLD), gear=("visor", GOLD)),
    dict(id="mouse", fem=True, bow="#ff2e88", head="#b8bcc4", muzzle="#f4f4f6", nose="#ff8aa8", ears="round", earin="#ffb8c8", jersey=(PURPLE, WHITEH), gear=("cap", GOLD, NAVY)),
    dict(id="penguin", fem=True, bow="#ff2e88", bowpos=(0.6, 0.5), head="#1f2228", ears="none", beak="owl", beakc="#ff9a1f", extras=[("patches", "#ffffff")], eyes=(-0.95, 0.15, 0.34, 0.18), jersey=(BLUE, WHITEH), gear=("headband", RED), bandz=0.55),
    dict(id="monkey", head="#7a4a26", muzzle="#f1c7a5", muzzlesize=(0.62, 0.45, 0.45), ears="round", ear="#7a4a26", earin="#f1c7a5", jersey=(ORANGE, NAVY), gear=("shades", BLACKH)),
    dict(id="cow", fem=True, bow="#ff2e88", head="#ffffff", ears="horns", ear="#ffffff", snout="#ffb8c8", extras=[("spots", "#2a2a2e")], jersey=(GREEN, WHITEH), gear=("cap", NAVY, RED)),
    dict(id="sheep", fem=True, bow="#6a2c91", head="#f6f0e4", muzzle="#3a3036", ears="floppy", ear="#3a3036", extras=[("tuft", "#ffffff")], nose="#1c1c1e", jersey=(PINK, WHITEH), gear=("headband", TEAL)),
    dict(id="swan", fem=True, bow="#ff2e88", bowpos=(0.6, 0.55), head="#ffffff", ears="none", beak="swan", beakc="#ff7a1a", eyes=(-0.8, 0.25, 0.36, 0.17), jersey=(NAVY, GOLD)),
    dict(id="hedgehog", head="#d9b48a", muzzle="#f4e4c8", ears="round", extras=[("spikes", "#6a4a2a")], jersey=(RED, GOLD), gear=("shades", "#ff8a1f")),
    dict(id="gorilla", head="#34343a", muzzle="#8a8490", muzzlesize=(0.72, 0.5, 0.48), ears="none", nose="#1c1c1e", extras=[("brow", "#26262c"), ("tuft", "#34343a")], shape=(1.0, 0.95, 1.08), eyes=(-0.86, 0.12, 0.3, 0.15), jersey=(BLUE, GOLD), gear=("shades", RED)),
    dict(id="wolf", head="#7a828c", muzzle="#e8ecf0", ears="pointy", earin="#e8ecf0", jersey=(BLACKH, RED), gear=("cap", BLACKH, RED)),
    dict(id="deer", fem=True, bow="#ffc93a", bowpos=(0.6, 0.55), head="#b07a44", muzzle="#f4e4c8", ears="floppy", ear="#b07a44", jersey=(GREEN, ORANGE)),
    dict(id="chick", fem=True, bow="#2f86ff", bowpos=(0.55, 0.5), head="#ffe14a", ears="none", beak="owl", extras=[("tuft", "#ffe14a"), ("cheeks", "#ff9a8a")], jersey=(TEAL, WHITEH), gear=("headband", PINK), bandz=0.55),
    dict(id="turtle", head="#6aae4a", muzzle="#bfe0a0", ears="none", extras=[("shell", "#7a5a2a")], jersey=(GOLD, NAVY), gear=("cap", RED, GOLD)),
]
import sys
only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for c in CRITTERS:
    if not only or c["id"] in only: build(c)
