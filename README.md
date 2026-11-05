# Backyard Cornhole

A 3D cornhole game for iPhone (and the web) with a career mode. It's built with three.js, hosted in a native iOS app.

## How it plays

- **Career:** five venues (Backyard, Tailgate Lot, Beach Bar, Brewery Patio, Stadium Finals). Each one is a new 3D location with stronger wind, a faster aim arrow, a smaller sweet spot, slicker boards and better opponents. A win earns stars and the venue prize, and a loss costs some stars. Stars unlock the next venue.
- **Pro Shop:** spend coins on bags (Accuracy, Control and Spin stats, plus a sticky, neutral or fast slide) and on board designs.
- **Aiming:** tap where the bag should finish, then drag the landing ring around the gold zone. Near the finish it sticks, farther back it slides, and off to the side it adds spin.
- **Throwing:** one move. Pull back for power, and the arrow swings faster the harder you pull. Let go in the gold band with the arrow straight. Pulling into overdrive makes the throw wild.
- **Wind:** steady for each inning, from any direction, and stronger at higher venues. The aiming guide ignores it.
- **Other rules:**
  - Pitcher's boxes are assigned by coin flip each match.
  - If one of your own bags is in the way, a push shot shoves it along your line.
  - Scoring uses cancellation scoring to 21.
  - Sinking all four bags in one inning is a 4-BAGGER.
- **Pass & Play** for two people on one phone. Online play is planned.

## Project layout

```
web/src/            the game: head.html (markup and styles), engine.js (physics, planner, CPU),
                    g1_flow.js, g2_world.js, g3_objects.js, g4_ui.js (one ES module using three.js)
web/vendor/         three.js 0.160 (MIT) and the Lilita One and Nunito fonts (OFL)
web/build.sh        builds everything below from web/src
web/index.html      built: a single page for browsers (loads three.js and fonts from CDNs)
Cornhole/Web/       built: the offline copy bundled into the iPhone app
Cornhole/App/       the iOS app: full-screen WKWebView, app:// file server, saves, haptics
Cornhole/Engine/    the earlier native Swift physics engine (not used by the app; kept for online play later)
```

Edit files in `web/src`, then run `web/build.sh` before building the app or publishing the page.

## Running the iPhone app

1. Open `Cornhole.xcodeproj` in Xcode 16 or later.
2. Pick an iPhone simulator, or your iPhone after you set a Team under Signing & Capabilities, and press Run.

Your career is saved on the device. In debug builds you can inspect the game from Safari on a Mac: open the Develop menu, then choose the simulator or your phone.
