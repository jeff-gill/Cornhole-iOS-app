"""Builds the cornhole board's frame and legs in Blender, bakes soft shadows (ambient occlusion) into vertex colours
and exports two single-file glTF models for the game (web/assets/blender/board_frame.json, board_legs.json).
The painted top stays in the game (it carries the shop's board designs); these parts go around and under it.

Coordinates match the game's board in feet: the board is 2 ft wide (x -1..1) and 4 ft long. Blender +Y runs from the
front edge (0) to the back (4); after export that becomes the game's -Z. The frame hangs below the top (z 0 down to
-0.29, a 2x4 on edge). Legs are in the board's un-tilted space, standing at the back.
Run from the repo root:  blender -b --python web/tools/blender/board.py"""
import bpy, os, math, json, base64
from mathutils import Vector

OUT = os.path.join(os.getcwd(), "web/assets/blender")
HW, L, RAIL_W, RAIL_H = 1.0, 4.0, 0.125, 0.29

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 96
    sc.world = bpy.data.worlds.new("w")

def box(name, size, loc, bevel=0.018, segs=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.active_object; o.name = name
    o.scale = size; bpy.ops.object.transform_apply(scale=True)
    m = o.modifiers.new("bevel", "BEVEL"); m.width = bevel; m.segments = segs; m.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier="bevel")
    return o

def bolt(loc, axis="x"):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.035, location=loc)
    o = bpy.context.active_object; o.scale = (0.45, 1, 1) if axis == "x" else (1, 0.45, 1); bpy.ops.object.transform_apply(scale=True)
    return o

def colour(objs, rgb):
    lin = tuple(c ** 2.2 for c in rgb)
    for o in objs:
        me = o.data; a = me.color_attributes.get("Col") or me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        for i in range(len(a.data)): a.data[i].color = (*lin, 1)
        me.color_attributes.active_color = a

def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name; bpy.ops.object.shade_smooth()
    return o

def bake(obj, occluders):
    me = obj.data; ao = me.color_attributes.new("AO", "FLOAT_COLOR", "CORNER"); me.color_attributes.active_color = ao
    mat = bpy.data.materials.new("bake"); mat.use_nodes = True; me.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    sc = bpy.context.scene; sc.cycles.bake_type = "AO"; sc.render.bake.target = "VERTEX_COLORS"
    sc.world.light_settings.distance = 0.6  # local contact shadows, not whole-scene darkening
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    col = me.color_attributes["Col"]
    for i in range(len(col.data)):
        a = 0.3 + 0.7 * ao.data[i].color[0]; c = col.data[i].color; col.data[i].color = (c[0] * a, c[1] * a, c[2] * a, 1)
    me.color_attributes.remove(ao); me.color_attributes.active_color = me.color_attributes["Col"]
    me.materials.clear()
    m = bpy.data.materials.new("part"); m.use_nodes = True
    vc = m.node_tree.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
    bsdf = m.node_tree.nodes["Principled BSDF"]; bsdf.inputs["Roughness"].default_value = 0.8
    m.node_tree.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"]); me.materials.append(m)
    for o in occluders: bpy.data.objects.remove(o)

def export(obj, name):
    bpy.ops.object.select_all(action="DESELECT"); obj.select_set(True)
    path = os.path.join(OUT, name + ".gltf")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLTF_SEPARATE", use_selection=True, export_colors=True,
                              export_attributes=True, export_yup=True, export_apply=True)
    g = json.load(open(path))
    for b in g.get("buffers", []):
        bp = os.path.join(OUT, b["uri"]); b["uri"] = "data:application/octet-stream;base64," + base64.b64encode(open(bp, "rb").read()).decode(); os.remove(bp)
    json.dump(g, open(os.path.join(OUT, name + ".json"), "w"), separators=(",", ":")); os.remove(path)
    print("wrote", name, os.path.getsize(os.path.join(OUT, name + ".json")), "bytes")

# ── Frame: four 2x4 rails under the top, with carriage-bolt heads where the legs attach. White, so the game can tint
# it with the board design's colour; the baked shading stays.
reset()
top = box("top_occluder", (2 * HW, L, 0.05), (0, L / 2, 0.025), bevel=0.005)   # only shades the frame, not exported
ground = box("ground", (12, 12, 0.02), (0, L / 2, -1.2), bevel=0.001)
rails = [
    box("side_l", (RAIL_W, L, RAIL_H), (-HW + RAIL_W / 2, L / 2, -RAIL_H / 2)),
    box("side_r", (RAIL_W, L, RAIL_H), (HW - RAIL_W / 2, L / 2, -RAIL_H / 2)),
    box("front", (2 * HW - 2 * RAIL_W, RAIL_W, RAIL_H), (0, RAIL_W / 2, -RAIL_H / 2)),
    box("back", (2 * HW - 2 * RAIL_W, RAIL_W, RAIL_H), (0, L - RAIL_W / 2, -RAIL_H / 2)),
    box("brace", (2 * HW - 2 * RAIL_W, 0.09, 0.2), (0, L * 0.45, -0.1)),
]
bolts = [bolt((sx * (HW + 0.005), L - 0.4, -0.14)) for sx in (-1, 1)]
colour(rails, (1, 1, 1)); colour(bolts, (0.32, 0.32, 0.34))
frame = join(rails + bolts, "frame"); bake(frame, [top, ground]); export(frame, "board_frame")

# ── Legs: a 2x4 on each side, splayed a little, with a cross brace between them. Natural wood colour.
reset()
LEG_H, Y = 0.82, L - 0.4
top = box("top_occluder", (2 * HW, L, 0.35), (0, L / 2, 1.0), bevel=0.005)
ground = box("ground", (12, 12, 0.02), (0, L / 2, -0.01), bevel=0.001)
legs = []
for sx in (-1, 1):
    # Built at the origin and splayed there, then moved: box() bakes its position in, so rotating in place would
    # swing the leg around the world origin and sink it into the ground.
    leg = box(f"leg{sx}", (0.125, 0.29, LEG_H), (0, 0, 0)); leg.rotation_euler.x = math.radians(-8)
    bpy.ops.object.select_all(action="DESELECT"); leg.select_set(True); bpy.context.view_layer.objects.active = leg
    bpy.ops.object.transform_apply(rotation=True)
    leg.location = (sx * (HW - 0.2), Y, LEG_H / 2 * math.cos(math.radians(8)) + 0.01); bpy.ops.object.transform_apply(location=True)
    legs.append(leg)
cross = box("cross", (2 * HW - 0.52, 0.09, 0.14), (0, Y + 0.05, 0.28))
feet = [box(f"foot{sx}", (0.15, 0.32, 0.03), (sx * (HW - 0.2), Y + 0.06, 0.015), bevel=0.006) for sx in (-1, 1)]
colour(legs + [cross], (0.70, 0.52, 0.32)); colour(feet, (0.25, 0.25, 0.27))
legsObj = join(legs + [cross] + feet, "legs"); bake(legsObj, [top, ground]); export(legsObj, "board_legs")
