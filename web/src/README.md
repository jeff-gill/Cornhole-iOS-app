# Web game sources

`web/index.html` is built from these files, in this order:

1. `head.html`: styles and page markup
2. `engine.js`: physics, throw planner, scoring, CPU (classic script)
3. `g1_flow.js`, `g2_world.js`, `g3_objects.js`, `g4_ui.js`: concatenated into one ES module (three.js 0.160 from jsDelivr via an import map)
