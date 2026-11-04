# Cornhole (iOS)

A physics-based cornhole game for iPhone and iPad, built with SwiftUI. It has no third-party dependencies.

## How it plays

1. **Pick the finish.** Tap the top-down board where you want the bag to end up (green).
2. **Pick the landing.** Drag the yellow ring around the gold fan-shaped zone to choose where the bag hits first. Close to the finish gives a high arc that sticks. Farther back gives a flat throw that slides in. Off to one side adds spin, so the bag kicks and hooks toward the finish. **Stick it** drops the bag right on the finish spot.
3. **Push shots.** If one of your own bags is in the way, the planned throw adds just enough force for your bag to shove it along your line of travel, for example into the hole.
4. **Execute it.** Stop three moving needles in turn: **Direction**, **Strength** and **Height**. The bag goes exactly where you planned only if all three stops are perfect. A sloppy direction stop also puts the wrong spin on the bag.
5. **Watch it play out.** The side view shows the thrower's swing and the bag's flight over a backyard scene. The top-down view shows the bag landing, sliding, pushing other bags, getting knocked off, or dropping in with confetti.

Scoring uses cancellation rules: a bag in the hole is worth 3 and a bag on the board is worth 1. Only the difference is awarded each inning, so if you throw 4 and they throw 1, you score 3. The first player to 21 wins. You can play against the computer or pass and play with two players, at four difficulty levels.

A playable web version of the same game is in `web/index.html`. Open it in Safari on any phone.

## Running it

1. Open `Cornhole.xcodeproj` in **Xcode 16 or later**.
2. Select the **Cornhole** target, then **Signing & Capabilities**, and pick your team. Change the bundle id (`com.jeffgill.cornhole`) if Xcode asks you to.
3. Run on an iPhone or a simulator (iOS 17+).

The project uses Xcode's folder-synced groups, so any file you add under `Cornhole/` is picked up automatically.

## Code layout

```
Cornhole/
  Engine/            pure Swift, no UI
    Court.swift          regulation geometry (27 ft apart, 2x4 board, 6" hole) and tuning knobs
    Physics.swift        ballistic flight, spin and hook, sliding, bag-on-bag pushes, hole and edge checks
    ThrowSolver.swift    landing zone, perfect release (arc + spin), what-if simulation, push shots
    ThrowExecution.swift difficulty levels, meters, how meter errors bend the throw
    Rules.swift          cancellation scoring and the CPU opponent
  Game/
    GameModel.swift      turn and inning flow, aiming, effects queue, haptics
    Platform.swift       haptics
  Scene/             SpriteKit
    GameScene.swift      side view + top-down board, frame loop, particles, touches
    ThrowerNode.swift    the animated thrower
    Art.swift            procedurally painted textures (grass, boards, backyard, bags)
    SceneGeometry.swift  feet-to-points mappings
  Views/             SwiftUI: menu, scoreboard, meters, inning summary
web/index.html       the same game as a single web page
```

You can change how the game feels in `Tuning` (`Court.swift`): board friction, how much speed a bag keeps on landing, spin strength, and how bouncy collisions are. You can also change it in `ThrowExecution` (how big a full miss is on each meter) and in `Difficulty` (needle speed, the size of the perfect zone, and CPU accuracy).

All the art is drawn in code, so you can replace any texture in `Art.swift` with a real image from the asset catalog later.
