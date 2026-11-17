#!/usr/bin/env python3
"""Converts the web game's glTF models (.json with embedded buffers) into a small binary format the Unity
version loads directly (Assets/Resources/Models/<name>.bytes), with no Unity packages needed.

The web scene is right-handed (three.js); the Unity scene maps three's (x, y, z) to (x, y, -z), so z is
negated here and triangles are flipped to keep their outward faces. Node transforms are baked in, and
primitives are merged per material. Base colour textures are copied next to the models.

Run from the repo root:  python3 Unity/Tools/convert_models.py
"""
import base64, json, math, os, shutil, struct, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "web", "assets")
OUT = os.path.join(ROOT, "Unity", "Assets", "Resources", "Models")

MODELS = {
    "nature": ["commontree_1", "commontree_2", "commontree_3", "commontree_4", "commontree_5", "birchtree_1", "birchtree_3",
               "pinetree_1", "pinetree_3", "pinetree_5", "flowers", "bushberries_1", "bush_1", "bush_2", "plant_3", "grass_short",
               "grass", "rock_1", "rock_moss_2", "treestump"],
    "blender": ["board_frame", "board_legs"],
    "polyhaven": ["wooden_picnic_table", "plastic_monobloc_chair_01"],
}

CT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
NORM = {5121: 255.0, 5123: 65535.0, 5120: 127.0, 5122: 32767.0}


def mat_mul(a, b):
    return [sum(a[r + 4 * k] * b[k + 4 * c] for k in range(4)) for c in range(4) for r in range(4)]  # column-major


def trs(node):
    if "matrix" in node:
        return node["matrix"]
    t = node.get("translation", [0, 0, 0]); r = node.get("rotation", [0, 0, 0, 1]); s = node.get("scale", [1, 1, 1])
    x, y, z, w = r
    m = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
         2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
         2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
         0, 0, 0, 1]
    for c in range(3):
        for r_ in range(3):
            m[c * 4 + r_] *= s[c]
    m[12], m[13], m[14] = t
    return m


def load(path):
    d = json.load(open(path))
    base = os.path.dirname(path)
    bufs = []
    for b in d["buffers"]:
        uri = b["uri"]
        bufs.append(base64.b64decode(uri.split(",", 1)[1]) if uri.startswith("data:") else open(os.path.join(base, uri), "rb").read())

    def acc(i):
        a = d["accessors"][i]; bv = d["bufferViews"][a["bufferView"]]
        n = NC[a["type"]]; fmt = CT[a["componentType"]]; size = struct.calcsize(fmt)
        stride = bv.get("byteStride") or n * size
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0); buf = bufs[bv["buffer"]]
        out = []
        for k in range(a["count"]):
            v = struct.unpack_from("<" + fmt * n, buf, off + k * stride)
            if a.get("normalized") or (fmt not in "fI" and n > 1 and a["componentType"] in NORM and "COLOR" in str(i)):
                v = tuple(x / NORM[a["componentType"]] for x in v)
            out.append(v)
        return out, a
    return d, base, acc


def convert(kind, name):
    path = os.path.join(SRC, kind, name + ".json") if kind != "polyhaven" else os.path.join(SRC, kind, name, name + "_1k.json")
    d, base, acc = load(path)
    subs = {}  # material index -> dict

    def walk(ni, parent):
        node = d["nodes"][ni]; m = mat_mul(parent, trs(node))
        if "mesh" in node:
            for p in d["meshes"][node["mesh"]]["primitives"]:
                if p.get("mode", 4) != 4:
                    continue
                pos, _ = acc(p["attributes"]["POSITION"])
                nrm = acc(p["attributes"]["NORMAL"])[0] if "NORMAL" in p["attributes"] else None
                uv = acc(p["attributes"]["TEXCOORD_0"])[0] if "TEXCOORD_0" in p["attributes"] else None
                col = None
                if "COLOR_0" in p["attributes"]:
                    ca, cinfo = acc(p["attributes"]["COLOR_0"])
                    if cinfo["componentType"] != 5126 and not cinfo.get("normalized"):
                        ca = [tuple(x / NORM[cinfo["componentType"]] for x in v) for v in ca]
                    col = [tuple(v) + (1.0,) if len(v) == 3 else tuple(v) for v in ca]
                idx = [v[0] for v in acc(p["indices"])[0]] if "indices" in p else list(range(len(pos)))
                s = subs.setdefault(p.get("material", -1), {"pos": [], "nrm": [], "col": [], "uv": [], "idx": []})
                b0 = len(s["pos"])
                for k, v in enumerate(pos):
                    x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12]
                    y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]
                    z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]
                    s["pos"].append((x, y, -z))
                    if nrm:
                        n = nrm[k]
                        nx = m[0] * n[0] + m[4] * n[1] + m[8] * n[2]; ny = m[1] * n[0] + m[5] * n[1] + m[9] * n[2]; nz = m[2] * n[0] + m[6] * n[1] + m[10] * n[2]
                        l = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
                        s["nrm"].append((nx / l, ny / l, -nz / l))
                    else:
                        s["nrm"].append((0, 1, 0))
                    s["col"].append(col[k] if col else (1, 1, 1, 1))
                    s["uv"].append((uv[k][0], 1 - uv[k][1]) if uv else (0, 0))
                for t in range(0, len(idx) - 2, 3):  # flipped winding (z was mirrored)
                    s["idx"] += [b0 + idx[t], b0 + idx[t + 2], b0 + idx[t + 1]]
        for c in node.get("children", []):
            walk(c, m)

    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for ni in d["scenes"][d.get("scene", 0)]["nodes"]:
        walk(ni, ident)

    os.makedirs(os.path.join(OUT, "Tex"), exist_ok=True)
    out = bytearray(b"CHM1"); out += struct.pack("<i", len(subs))
    lo = [1e9] * 3; hi = [-1e9] * 3; nv = 0
    for mi, s in subs.items():
        mat = d["materials"][mi] if mi >= 0 else {}
        pbr = mat.get("pbrMetallicRoughness", {})
        color = pbr.get("baseColorFactor", [1, 1, 1, 1])
        tex = ""
        if "baseColorTexture" in pbr:
            img = d["images"][d["textures"][pbr["baseColorTexture"]["index"]]["source"]]
            if "uri" in img and not img["uri"].startswith("data:"):
                src = os.path.join(base, img["uri"]); tex = os.path.splitext(os.path.basename(src))[0]
                shutil.copyfile(src, os.path.join(OUT, "Tex", os.path.basename(src)))
        mode = {"OPAQUE": 0, "MASK": 1, "BLEND": 2}[mat.get("alphaMode", "OPAQUE")]
        out += struct.pack("<4f2fif i", *color, pbr.get("metallicFactor", 1.0), pbr.get("roughnessFactor", 1.0), mode,
                           mat.get("alphaCutoff", 0.5), 1 if mat.get("doubleSided") else 0)
        tb = tex.encode(); out += struct.pack("<i", len(tb)) + tb
        n = len(s["pos"]); nv += n
        out += struct.pack("<i", n)
        for arr in ("pos", "nrm", "col", "uv"):
            for v in s[arr]:
                out += struct.pack("<%df" % len(v), *v)
        out += struct.pack("<i", len(s["idx"])) + struct.pack("<%di" % len(s["idx"]), *s["idx"])
        for v in s["pos"]:
            for k in range(3):
                lo[k] = min(lo[k], v[k]); hi[k] = max(hi[k], v[k])
    open(os.path.join(OUT, name + ".bytes"), "wb").write(out)
    return nv, [round(x, 2) for x in lo], [round(x, 2) for x in hi], len(subs)


if __name__ == "__main__":
    for kind, names in MODELS.items():
        for name in names:
            nv, lo, hi, ns = convert(kind, name)
            print(f"{name:28s} {nv:6d} verts {ns} materials  size {[round(h - l, 2) for l, h in zip(lo, hi)]}")
