"""Headgear avatars: 25 hats and helmets on their own (no head), rendered to transparent PNGs.
Run from the repo root:  blender -b --python web/tools/blender/hats.py [-- id id ...]   (writes web/assets/hats/<id>.png)"""
import bpy, bmesh, math, os, sys
from mathutils import Vector

OUT = os.path.join(os.getcwd(), "web/assets/hats"); os.makedirs(OUT, exist_ok=True)
MATS = {}
RED, NAVY, GOLD, WHITE, BLACK, GREEN, BLUE, ORANGE, BROWN, TAN, GREY, PINK = "#c8102e", "#1f3a6e", "#ffc93a", "#f6f6f6", "#1e1e22", "#2fbf71", "#2f86ff", "#ff8a1f", "#8a5a2e", "#d9b480", "#9aa0a8", "#ff4f9a"

def hexc(h): h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

def mat(c, rough=0.55, metal=0.0):
    c = hexc(c) if isinstance(c, str) else c; k = (c, rough, metal)
    if k not in MATS:
        m = bpy.data.materials.new("m"); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*[x ** 2.2 for x in c], 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
        MATS[k] = m
    return MATS[k]

def fin(o, c, rough=0.55, metal=0.0, smooth=True):
    o.data.materials.append(mat(c, rough, metal)); bpy.context.view_layer.objects.active = o
    (bpy.ops.object.shade_smooth if smooth else bpy.ops.object.shade_flat)(); return o

def sphere(loc, scale, c, half=False, rough=0.55, metal=0.0, seg=40):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1, location=loc); o = bpy.context.active_object; o.scale = scale
    if half:
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.001], context="VERTS"); bm.to_mesh(o.data); bm.free()
    return fin(o, c, rough, metal)

def cyl(loc, r, d, c, rot=(0, 0, 0), r2=None, verts=48, rough=0.55, metal=0.0):
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=rot)
    else: bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=d, location=loc, rotation=rot)
    return fin(bpy.context.active_object, c, rough, metal)

def torus(loc, R, r, c, rot=(0, 0, 0), scale=(1, 1, 1), rough=0.55, metal=0.0):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot, major_segments=48, minor_segments=12)
    o = bpy.context.active_object; o.scale = scale; return fin(o, c, rough, metal)

def box(loc, size, c, rot=(0, 0, 0), bevel=0.04, rough=0.55, metal=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.active_object; o.scale = size
    bpy.ops.object.transform_apply(scale=True); m = o.modifiers.new("b", "BEVEL"); m.width = bevel; m.segments = 3; bpy.ops.object.modifier_apply(modifier="b")
    return fin(o, c, rough, metal)

def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True); MATS.clear()
    sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.samples = 64; sc.cycles.use_denoising = False
    sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 256; sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.92, 0.95, 1, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.0; sc.world = w
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(45), math.radians(-15), math.radians(-35))); bpy.context.active_object.data.energy = 3.4

def render(name):
    objs = [o for o in bpy.data.objects if o.type == "MESH"]; bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)]); ctr = (lo + hi) / 2
    size = max(hi - lo) * 1.22
    d = Vector((0.55, -1, 0.42)).normalized()  # a three-quarter view from the front, a little above
    bpy.ops.object.camera_add(location=ctr + d * 20); cam = bpy.context.active_object
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler(); cam.data.type = "ORTHO"; cam.data.ortho_scale = size; bpy.context.scene.camera = cam
    bpy.context.scene.render.filepath = os.path.join(OUT, name + ".png"); bpy.ops.render.render(write_still=True); print("wrote", name)

def ball_cap(crown=RED, brim=WHITE, name="ballcap"):
    setup(); sphere((0, 0, 0), (1, 1.05, 0.85), crown, half=True)
    b = cyl((0, -1.05, 0.04), 0.75, 0.06, brim, rot=(math.radians(-6), 0, 0)); b.scale = (1.05, 1.0, 1)
    sphere((0, 0, 0.86), (0.1, 0.1, 0.07), brim); torus((0, 0, 0.03), 1.0, 0.04, brim, scale=(1, 1.05, 1)); render(name)

def beanie():
    setup(); sphere((0, 0, 0), (1, 1, 1.05), GREEN, half=True); cyl((0, 0, 0.05), 1.03, 0.32, WHITE)
    sphere((0, 0, 1.18), (0.3, 0.3, 0.3), WHITE, rough=0.9); render("beanie")

def bucket():
    setup(); cyl((0, 0, 0.42), 0.85, 0.85, TAN, r2=0.72); cyl((0, 0, 0.86), 0.72, 0.04, TAN); cyl((0, 0, 0.0), 1.45, 0.08, TAN, r2=1.0)
    cyl((0, 0, 0.12), 0.86, 0.14, BROWN); render("bucket")

def visor():
    setup(); torus((0, 0, 0), 1.0, 0.12, BLUE, scale=(1, 1.05, 0.9)); b = cyl((0, -1.05, 0.0), 0.8, 0.06, BLUE, rot=(math.radians(-12), 0, 0)); b.scale = (1.05, 1, 1); render("visor")

def cowboy(c=BROWN, band=BLACK, name="cowboy"):
    setup(); sphere((0, 0, 0.12), (0.8, 0.95, 0.95), c, half=True); sphere((0, 0, 0.98), (0.45, 0.22, 0.14), c)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.6, depth=0.07, location=(0, 0, 0.12)); br = bpy.context.active_object; br.scale = (1.0, 1.15, 1)
    bpy.ops.object.transform_apply(scale=True)
    for v in br.data.vertices: v.co.z += 0.55 * max(0.0, abs(v.co.x) - 0.75) ** 2  # the sides of the brim curl up
    fin(br, c); cyl((0, 0, 0.25), 0.82, 0.16, band); render(name)

def trucker():
    setup(); sphere((0, 0, 0), (1, 1.05, 0.95), WHITE, half=True); sphere((0, -0.02, 0.0), (1.01, 0.75, 0.96), NAVY, half=True)
    b = cyl((0, -1.05, 0.04), 0.75, 0.06, NAVY, rot=(math.radians(-6), 0, 0)); b.scale = (1.05, 1.0, 1); render("trucker")

def sunhat():
    setup(); sphere((0, 0, 0), (0.85, 0.85, 0.8), "#e8d29a", half=True, rough=0.9); cyl((0, 0, 0.02), 1.9, 0.05, "#e8d29a", rough=0.9); cyl((0, 0, 0.15), 0.87, 0.2, PINK); render("sunhat")

def football(c=RED, stripe=WHITE, mask=GREY, name="football"):
    setup(); sphere((0, 0.05, 0.1), (1, 1.15, 1.05), c, rough=0.25)
    torus((0, 0.05, 0.1), 1.08, 0.07, stripe, rot=(0, math.radians(90), 0), scale=(1, 1.07, 0.98))  # the stripe front to back
    for k in range(3): cyl((0, -1.12, -0.2 - k * 0.2), 0.045, 1.0, mask, rot=(0, math.radians(90), 0), metal=0.5)  # face mask bars
    for sx in (-1, 1): cyl((sx * 0.6, -1.05, -0.45), 0.04, 0.6, mask, metal=0.5)
    render(name)

def hardhat():
    setup(); sphere((0, 0, 0), (0.95, 1.05, 0.85), GOLD, half=True, rough=0.35); cyl((0, 0, 0.02), 1.2, 0.06, GOLD, rough=0.35); box((0, 0, 0.82), (0.25, 1.6, 0.12), GOLD); render("hardhat")

def beret():
    setup(); s = sphere((0, 0, 0), (1.2, 1.2, 0.35), RED, rough=0.9); s.rotation_euler = (0, math.radians(14), 0); cyl((0, 0, -0.12), 0.95, 0.12, RED); cyl((0.15, 0, 0.36), 0.04, 0.2, RED); render("beret")

def fedora():
    setup(); c = cyl((0, 0, 0.45), 0.85, 0.9, GREY, r2=0.75); sphere((0, 0, 0.9), (0.75, 0.75, 0.15), GREY); box((0, -0.2, 0.95), (0.18, 0.8, 0.12), GREY)
    cyl((0, 0, 0.02), 1.45, 0.06, GREY); cyl((0, 0, 0.18), 0.86, 0.2, BLACK); render("fedora")

def bike():
    setup(); sphere((0, 0, 0), (1, 1.25, 0.9), BLUE, half=True, rough=0.3)
    for k in range(4): box((-0.45 + k * 0.3, 0.1, 0.78), (0.12, 1.4, 0.18), WHITE)
    b = cyl((0, -1.25, 0.08), 0.5, 0.05, BLACK, rot=(math.radians(-15), 0, 0)); b.scale = (1.2, 0.6, 1); render("bike")

def party():
    setup(); cyl((0, 0, 0.9), 0.75, 1.8, PINK, r2=0.0); [torus((0, 0, 0.2 + k * 0.45), 0.66 - k * 0.17, 0.05, GOLD) for k in range(3)]
    sphere((0, 0, 1.85), (0.22, 0.22, 0.22), GOLD); render("party")

def chef():
    setup(); cyl((0, 0, 0.4), 0.85, 0.8, WHITE, rough=0.8); [sphere((math.cos(a) * 0.55, math.sin(a) * 0.55, 1.05), (0.55, 0.55, 0.45), WHITE, rough=0.8) for a in [k / 5 * math.tau for k in range(5)]]
    sphere((0, 0, 1.2), (0.6, 0.6, 0.45), WHITE, rough=0.8); render("chef")

def tophat():
    setup(); cyl((0, 0, 0.75), 0.75, 1.5, BLACK, rough=0.35); cyl((0, 0, 0.02), 1.35, 0.06, BLACK, rough=0.35); cyl((0, 0, 0.22), 0.77, 0.25, RED); render("tophat")

def propeller():
    setup(); sphere((0, 0, 0), (1, 1, 0.9), RED, half=True); [sphere((0, 0, 0), (1.005, 1.005, 0.905), c, half=True) for c in []]
    for k, c in enumerate([BLUE, GOLD, GREEN, RED]):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1); o = bpy.context.active_object; o.scale = (1.01, 1.01, 0.91)
        bm = bmesh.new(); bm.from_mesh(o.data); a0 = k * math.pi / 2
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0 or not (a0 <= (math.atan2(v.co.y, v.co.x) % math.tau) <= a0 + math.pi / 2)], context="VERTS"); bm.to_mesh(o.data); bm.free(); fin(o, c)
    cyl((0, 0, 1.0), 0.04, 0.3, BLACK); [box((math.cos(a) * 0.5, math.sin(a) * 0.5, 1.15), (1.0, 0.18, 0.04), c, rot=(0, 0, a)) for a, c in ((0.3, RED), (0.3 + math.pi, BLUE))]; render("propeller")

def viking():
    setup(); sphere((0, 0, 0), (1, 1, 1), GREY, half=True, rough=0.3, metal=0.7); torus((0, 0, 0.05), 1.0, 0.09, GOLD, metal=0.8, rough=0.3)
    for sx in (-1, 1):
        h = cyl((sx * 1.15, 0, 0.95), 0.32, 1.5, "#f1e6c8", r2=0.0); h.rotation_euler = (0, sx * math.radians(-35), 0)
    box((0, 0, 0.55), (0.12, 2.0, 0.12), GOLD, metal=0.8); render("viking")

def pirate():
    setup(); s = sphere((0, 0, 0), (1.6, 0.8, 0.9), BLACK, half=True, rough=0.6); torus((0, 0, 0.02), 1.0, 0.06, GOLD, scale=(1.6, 0.8, 1))
    box((0, -0.82, 0.45), (0.5, 0.05, 0.4), WHITE, bevel=0.1); render("pirate")

def sombrero():
    setup(); cyl((0, 0, 0.55), 0.7, 1.1, "#e8b84a", r2=0.35, rough=0.85); sphere((0, 0, 1.1), (0.35, 0.35, 0.15), "#e8b84a", rough=0.85)
    cyl((0, 0, 0.03), 2.1, 0.06, "#e8b84a", rough=0.85); torus((0, 0, 0.1), 2.1, 0.08, RED); cyl((0, 0, 0.3), 0.66, 0.2, GREEN); render("sombrero")

def grad():
    setup(); cyl((0, 0, 0.25), 0.85, 0.5, BLACK); box((0, 0, 0.55), (2.2, 2.2, 0.08), BLACK, rot=(0, 0, math.radians(45)), bevel=0.02)
    sphere((0, 0, 0.62), (0.08, 0.08, 0.05), GOLD); cyl((0.8, -0.5, 0.25), 0.03, 0.6, GOLD); sphere((0.8, -0.5, -0.08), (0.08, 0.08, 0.14), GOLD); render("grad")

def safari():
    setup(); sphere((0, 0, 0), (1, 1.1, 0.95), "#e8d8b0", half=True, rough=0.8); cyl((0, 0, 0.02), 1.45, 0.07, "#e8d8b0", rough=0.8); cyl((0, 0, 0.15), 1.0, 0.16, BROWN); sphere((0, 0, 0.95), (0.1, 0.1, 0.06), BROWN); render("safari")

def knight():
    setup(); cyl((0, 0, 0.3), 0.95, 1.3, GREY, rough=0.25, metal=0.85); sphere((0, 0, 0.95), (0.95, 0.95, 0.5), GREY, half=True, rough=0.25, metal=0.85)
    [box((0, -0.92, 0.15 + k * 0.18), (1.0, 0.05, 0.05), BLACK) for k in range(3)]; box((0, -0.93, 0.35), (0.06, 0.05, 0.75), GREY, metal=0.85)
    cyl((0, 0.15, 1.6), 0.08, 0.6, RED); sphere((0, 0.35, 1.85), (0.2, 0.55, 0.25), RED, rough=0.9); render("knight")

def crown():
    setup(); cyl((0, 0, 0.35), 1.0, 0.7, GOLD, rough=0.2, metal=0.95)
    for k in range(8):
        a = k / 8 * math.tau; cyl((math.cos(a) * 0.95, math.sin(a) * 0.95, 0.95), 0.2, 0.55, GOLD, r2=0.0, verts=4, rough=0.2, metal=0.95)
        sphere((math.cos(a) * 0.95, math.sin(a) * 0.95, 1.27), (0.09, 0.09, 0.09), GOLD, rough=0.2, metal=0.95)
    for k, c in enumerate([RED, BLUE, GREEN, RED]):
        a = k / 4 * math.tau + 0.4; sphere((math.cos(a) * 1.0, math.sin(a) * 1.0, 0.35), (0.12, 0.12, 0.12), c, rough=0.1)
    torus((0, 0, 0.02), 1.0, 0.07, WHITE, rough=0.9); render("crown")

def astronaut():
    setup(); sphere((0, 0, 0), (1.1, 1.1, 1.1), WHITE, rough=0.4); s = sphere((0, -0.55, 0.05), (0.8, 0.6, 0.65), "#1c2a44", rough=0.05, metal=0.6)
    sphere((-0.25, -1.08, 0.3), (0.15, 0.04, 0.1), WHITE, rough=0.05); torus((0, 0, -0.9), 0.8, 0.12, GREY, metal=0.6); render("astronaut")

def wizard():
    setup(); cyl((0, 0, 1.1), 0.85, 2.2, "#3a2a8a", r2=0.04); cyl((0, 0, 0.02), 1.55, 0.06, "#3a2a8a")
    for k in range(6): a = k * 1.1; sphere((math.cos(a) * 0.55, math.sin(a) * 0.55, 0.4 + k * 0.25), (0.08, 0.08, 0.08), GOLD, rough=0.2, metal=0.8)
    render("wizard")

def cowgirl(): cowboy(PINK, WHITE, "cowgirl")

def arch(c, r=0.09, R=1.0, metal=0.0, rough=0.55):  # a headband standing up, the way it sits over a head
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, rotation=(math.radians(90), 0, 0), major_segments=48, minor_segments=12)
    o = bpy.context.active_object; bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.05], context="VERTS"); bm.to_mesh(o.data); bm.free()  # keep the top half
    return fin(o, c, rough, metal)

def flowercrown():
    setup(); torus((0, 0, 0), 1.0, 0.08, "#3f8a3c", scale=(1, 1.05, 1))
    cols = [PINK, "#ffffff", "#ffd23a", "#c48cff", "#ff8a8a"]
    for k in range(10):
        a = k / 10 * math.tau; x, y = math.cos(a) * 1.0, math.sin(a) * 1.05; c = cols[k % len(cols)]
        for j in range(5): b = j / 5 * math.tau; sphere((x + math.cos(b) * 0.14, y + math.sin(b) * 0.14, 0.12), (0.12, 0.12, 0.06), c)
        sphere((x, y, 0.15), (0.08, 0.08, 0.06), "#ffd23a")
    render("flowercrown")

def tiara():
    setup(); arch("#d8dde6", 0.05, metal=0.95, rough=0.15)
    for k in range(-3, 4):
        a = math.pi / 2 + k * 0.22; h = 0.6 - abs(k) * 0.12; x, z = math.cos(a), math.sin(a)
        o = cyl((x * (1 + h / 2), -0.05, z * (1 + h / 2)), 0.12, h, "#d8dde6", r2=0.0, verts=4, metal=0.95, rough=0.15); o.rotation_euler = (0, -(a - math.pi / 2), 0)
        sphere((x * (1 + h + 0.05), -0.05, z * (1 + h + 0.05)), (0.08, 0.08, 0.08), PINK if k == 0 else "#bfe6ff", rough=0.05)
    render("tiara")

def bowband():
    setup(); arch(PINK, 0.1)
    for sx in (-1, 1): cyl((0.45 + sx * 0.32, -0.1, 0.95), 0.32, 0.55, PINK, r2=0.04, rot=(0, math.radians(-90 * sx), 0), verts=4)
    sphere((0.45, -0.12, 0.95), (0.14, 0.14, 0.14), PINK); render("bowband")

def catears():
    setup(); arch(BLACK, 0.07)
    for sx in (-1, 1): o = cyl((sx * 0.6, -0.02, 1.0), 0.32, 0.6, BLACK, r2=0.02, verts=4); o.rotation_euler = (0, sx * math.radians(-25), 0); i = cyl((sx * 0.6, -0.1, 0.95), 0.18, 0.4, PINK, r2=0.01, verts=4); i.rotation_euler = (0, sx * math.radians(-25), 0)
    render("catears")

def pinkberet():
    setup(); s = sphere((0, 0, 0), (1.2, 1.2, 0.35), PINK, rough=0.9); s.rotation_euler = (0, math.radians(14), 0); cyl((0, 0, -0.12), 0.95, 0.12, PINK)
    sphere((0.75, -0.5, 0.25), (0.14, 0.14, 0.14), WHITE, rough=0.1); render("pinkberet")


HATS = [ball_cap, flowercrown, beanie, sunhat, cowboy, bowband, bucket, catears, trucker, pinkberet, football, party, hardhat, tiara,
        chef, cowgirl, tophat, propeller, fedora, viking, grad, wizard, crown, astronaut, beret]
only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for f in HATS:
    name = "ballcap" if f is ball_cap else f.__name__
    if not only or name in only: f()
