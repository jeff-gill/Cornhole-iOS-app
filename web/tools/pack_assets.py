#!/usr/bin/env python3
"""Packs downloaded Poly Haven assets into web-friendly files (the artifact host and the app both serve .json/.jpg):
  model/<name>_1k.gltf + <name>.bin  ->  model/<name>_1k.json   (buffers embedded as base64; textures stay as .jpg)
  <sky>.hdr                          ->  <sky>.hdr.json         ({"b64": "..."}; the game decodes it back to HDR)
Run from the repo root after downloading new assets: python3 web/tools/pack_assets.py"""
import base64, json, os, glob
root = "web/assets/polyhaven"
for gltf in glob.glob(f"{root}/*/*_1k.gltf"):
    d = os.path.dirname(gltf); g = json.load(open(gltf))
    for b in g.get("buffers", []):
        if b.get("uri") and not b["uri"].startswith("data:"):
            p = os.path.join(d, b["uri"]); b["uri"] = "data:application/octet-stream;base64," + base64.b64encode(open(p, "rb").read()).decode(); os.remove(p)
    json.dump(g, open(gltf[:-5] + ".json", "w"), separators=(",", ":")); os.remove(gltf)
for hdr in glob.glob(f"{root}/*.hdr"):
    json.dump({"b64": base64.b64encode(open(hdr, "rb").read()).decode()}, open(hdr + ".json", "w")); os.remove(hdr)
print("packed")
