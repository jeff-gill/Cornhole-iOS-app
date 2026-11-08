"""Builds the beach palms in Blender (curved ringed trunks, drooping comb-leaf fronds, coconuts) with baked soft shading,
using the helpers in trees.py. Run from the repo root:  blender -b --python web/tools/blender/palms.py
Output: web/assets/blender/palm_<n>.json  (units: feet, base at the origin)"""
import bpy, bmesh, math, random, os, sys
from mathutils import Vector, Matrix, noise
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trees import reset, paint, join, bake_ao, export

def bez(p0, p1, p2, t):  # quadratic curve
    return p0 * (1 - t) ** 2 + p1 * 2 * (1 - t) * t + p2 * t * t

def palm_trunk(height, lean, seed):
    """Stacked, slightly flared rings along a curve; returns the mesh and the top point and direction."""
    random.seed(seed)
    side = Vector((math.cos(seed), math.sin(seed), 0))
    p0, p1, p2 = Vector((0, 0, 0)), Vector((0, 0, height * 0.55)), Vector((0, 0, height)) + side * lean
    bm = bmesh.new(); rings = []; N, SEG = 9, 22
    for i in range(SEG + 1):
        t = i / SEG; c = bez(p0, p1, p2, t)
        d = (bez(p0, p1, p2, min(1, t + 0.01)) - bez(p0, p1, p2, max(0, t - 0.01))).normalized()
        r = (0.95 - 0.45 * t) * (1.12 if i % 2 == 0 else 0.94)  # ring bulges
        if i == 0: r = 1.25  # flared foot
        q = d.to_track_quat("Z", "Y"); ring = []
        for k in range(N):
            a = k / N * math.tau; ring.append(bm.verts.new(c + q @ Vector((math.cos(a) * r, math.sin(a) * r, 0))))
        rings.append(ring)
    for i in range(SEG):
        for k in range(N): bm.faces.new((rings[i][k], rings[i][(k + 1) % N], rings[i + 1][(k + 1) % N], rings[i + 1][k]))
    me = bpy.data.meshes.new("trunk"); bm.to_mesh(me); o = bpy.data.objects.new("trunk", me); bpy.context.collection.objects.link(o)
    top = bez(p0, p1, p2, 1.0); d = (p2 - bez(p0, p1, p2, 0.95)).normalized()
    ring_shade = lambda p, n: (lambda k: (0.52 * k, 0.42 * k, 0.30 * k))(0.85 + 0.15 * math.sin(p.length * 6.0) + 0.06 * noise.noise(p * 2))
    paint(o, ring_shade)
    return o, top, d

def frond(base, yaw, rise, length, seed, dead=False):
    """A drooping spine with a comb of leaflets: a V-folded strip whose edges zig-zag into separate leaflets."""
    random.seed(seed)
    bm = bmesh.new(); STEPS = 18
    dirh = Vector((math.cos(yaw), math.sin(yaw), 0)); left = Vector((-math.sin(yaw), math.cos(yaw), 0))
    spine = []
    for i in range(STEPS + 1):
        t = i / STEPS
        h = dirh * (length * t) ; z = length * (rise * t - (0.9 if dead else 0.55) * t * t * (1.6 if dead else 1))
        spine.append(base + h + Vector((0, 0, z)))
    rows = []
    for i, c in enumerate(spine):
        t = i / STEPS
        w = (1.9 if not dead else 1.0) * math.sin(math.pi * min(1, t * 1.15)) ** 0.7 * (0.55 + 0.45 * (1 - t))
        tip = w * (1.0 if i % 2 == 0 else 0.55)  # comb: alternate long and short to read as separate leaflets
        fold = 0.35 * w
        rows.append([bm.verts.new(c + left * tip + Vector((0, 0, -tip * 0.35))), bm.verts.new(c + Vector((0, 0, fold * 0.4))),
                     bm.verts.new(c - left * tip + Vector((0, 0, -tip * 0.35)))])
    for i in range(STEPS):
        for j in range(2): bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
    me = bpy.data.meshes.new("frond"); bm.to_mesh(me); o = bpy.data.objects.new("frond", me); bpy.context.collection.objects.link(o)
    k0 = random.uniform(-0.04, 0.04)
    if dead: paint(o, lambda p, n: (0.55 + k0, 0.42 + k0, 0.22))
    else: paint(o, lambda p, n: (0.20 + k0 + 0.05 * noise.noise(p * 0.8), 0.50 + k0 + 0.06 * max(0, n.z), 0.16 + 0.03 * noise.noise(p)))
    return o

def coconut(c, seed):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=7, radius=0.55, location=c)
    o = bpy.context.active_object; o.scale = (1, 1, 1.15)
    bpy.ops.object.transform_apply(scale=True)
    paint(o, lambda p, n: (0.42, 0.36, 0.14)); return o

def palm(name, height, lean, fronds, seed):
    reset(); random.seed(seed)
    t, top, d = palm_trunk(height, lean, seed); parts = [t]
    for k in range(fronds):
        yaw = k / fronds * math.tau + random.uniform(-0.2, 0.2)
        parts.append(frond(top + Vector((0, 0, 0.2)), yaw, random.uniform(0.35, 0.75), random.uniform(9, 11.5), seed * 100 + k))
    for k in range(3):  # a few dry fronds hanging under the crown
        parts.append(frond(top - Vector((0, 0, 0.4)), random.random() * math.tau, -0.2, random.uniform(5, 6.5), seed * 200 + k, dead=True))
    # a crown to hide where the fronds meet, and coconuts under it
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.9, location=top); cr = bpy.context.active_object
    paint(cr, lambda p, n: (0.36, 0.40, 0.18)); parts.append(cr)
    for k in range(4):
        a = k / 4 * math.tau + seed; parts.append(coconut(top + Vector((math.cos(a) * 0.8, math.sin(a) * 0.8, -0.9)), seed + k))
    o = join(parts, name)
    for m in o.data.polygons: m.use_smooth = True
    bake_ao(o)
    o.data.materials[0].use_backface_culling = False  # fronds are seen from both sides
    export(o, name)

palm("palm_a", 22, 4.5, 13, 1)
palm("palm_b", 27, 7.0, 12, 2)
palm("palm_c", 17, 2.5, 14, 3)
