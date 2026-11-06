#!/bin/bash
# Builds the game from web/src into:
#   web/index.html        - a single page that loads three.js and fonts from CDNs (for browsers / the artifact)
#   Cornhole/Web/         - an offline copy bundled inside the iPhone app (served by the app over app://game/)
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=web/src

# The game's name and tagline live in web/src/game.env.
source "$SRC/game.env"
sed_esc() { printf '%s' "$1" | sed -e 's/[\\|&]/\\&/g'; }
FIRST="${GAME_NAME%% *}"; REST="${GAME_NAME#"$FIRST"}"; REST="${REST# }"
TITLE_HTML="$FIRST${REST:+ <span>$REST</span>}" # first word white, the rest gold
brand() { sed -e "s|__GAME_NAME__|$(sed_esc "$GAME_NAME")|g" -e "s|__GAME_TAGLINE__|$(sed_esc "$GAME_TAGLINE")|g" -e "s|__GAME_TITLE_HTML__|$(sed_esc "$TITLE_HTML")|g"; }

# The iPhone app's display name (under the icon) comes from the same place.
sed -i.bak -e "s|INFOPLIST_KEY_CFBundleDisplayName = .*;|INFOPLIST_KEY_CFBundleDisplayName = \"$(sed_esc "$GAME_NAME")\";|" Cornhole.xcodeproj/project.pbxproj && rm -f Cornhole.xcodeproj/project.pbxproj.bak

body() { # $1 = import map JSON
  { cat "$SRC/head.html"
  printf '\n<script>\n"use strict";\n'
  cat "$SRC/engine.js"
  printf '</script>\n<script type="importmap">%s</script>\n<script type="module">\n' "$1"
  cat "$SRC/g1_flow.js" "$SRC/g1b_audio.js" "$SRC/g1c_online.js" "$SRC/g1d_economy.js" "$SRC/g2_world.js" "$SRC/g3_objects.js" "$SRC/g3b_aim.js" "$SRC/g3c_effects.js" "$SRC/g4b_extras.js" "$SRC/g4_ui.js"
  printf '</script>\n'; } | brand
}

CDN_MAP='{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}'
APP_MAP='{"imports":{"three":"./three.module.min.js","three/addons/":"./"}}'
HEAD='<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n<meta name="apple-mobile-web-app-capable" content="yes">\n'

# Web page (fragment form is what gets published as the artifact; index.html wraps it).
mkdir -p build
body "$CDN_MAP" > build/artifact.html
{ printf "$HEAD</head>\n<body>\n"; cat build/artifact.html; printf '\n</body>\n</html>\n'; } > web/index.html

# iPhone app: local fonts instead of Google Fonts, local three.js.
FONTS='<style>
@font-face { font-family: "Lilita One"; font-weight: 400; src: url("lilita-one-latin-400-normal.woff2") format("woff2"); }
@font-face { font-family: "Nunito"; font-weight: 700; src: url("nunito-latin-700-normal.woff2") format("woff2"); }
@font-face { font-family: "Nunito"; font-weight: 800; src: url("nunito-latin-800-normal.woff2") format("woff2"); }
@font-face { font-family: "Nunito"; font-weight: 900; src: url("nunito-latin-900-normal.woff2") format("woff2"); }
html, body { overscroll-behavior: none; -webkit-touch-callout: none; }
</style>'
mkdir -p Cornhole/Web
{
  printf "$HEAD"
  printf '%s\n</head>\n<body>\n' "$FONTS"
  body "$APP_MAP" | grep -v 'fonts.googleapis.com\|fonts.gstatic.com'
  printf '\n</body>\n</html>\n'
} > Cornhole/Web/index.html
cp web/vendor/three.module.min.js web/vendor/RoundedBoxGeometry.js web/vendor/*.woff2 Cornhole/Web/
# three.js add-ons (loaders, glow) and the Poly Haven assets, copied flat: the app serves files by name.
cp web/vendor/addons/*/*.js Cornhole/Web/
find web/assets -type f ! -name '*.md' -exec cp {} Cornhole/Web/ \;
cat web/vendor/three-LICENSE.txt > Cornhole/Web/third-party-licenses.txt
printf '\n\n---- Lilita One ----\n' >> Cornhole/Web/third-party-licenses.txt; cat web/vendor/lilita-one-OFL.txt >> Cornhole/Web/third-party-licenses.txt
printf '\n\n---- Nunito ----\n' >> Cornhole/Web/third-party-licenses.txt; cat web/vendor/nunito-OFL.txt >> Cornhole/Web/third-party-licenses.txt
echo "built web/index.html, build/artifact.html and Cornhole/Web/"
