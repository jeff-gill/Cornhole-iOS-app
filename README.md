# Cornhole (iOS)

A physics-based cornhole game for iPhone and iPad, built with SwiftUI. It has no third-party dependencies.

## How it plays

1. **Mark your spots.** Tap the top-down board to drop a yellow **landing** marker, where the bag should hit first. Tap again for a green **finish** marker, where you want it to stop. Drag either marker to adjust it. **Stick it** sets the finish spot on the landing spot, which gives you a high, dead-drop throw.
2. **The game works out the perfect throw.** The landing spot sets the direction and strength. The finish spot sets the arc, because flatter throws come in fast and slide while high throws drop steep and stick. On the easier levels the ideal arc shows in the side view and the expected slide shows on the board.
3. **Execute it.** Stop three moving needles in turn:
   - **Direction**: off-centre pushes the bag left or right.
   - **Strength**: off-centre sends it long or short.
   - **Height**: off-centre changes the arc, so the bag lands somewhere else *and* slides a different amount.

   The bag goes exactly where you planned only if all three stops are perfect.
4. **Watch it play out.** The side view shows the flight. The top-down view shows the bag landing, sliding, bumping other bags, getting knocked off, or dropping in.

Scoring uses standard cancellation rules: a bag in the hole is worth 3, a bag on the board is worth 1, and only the difference is awarded each inning. The first player to 21 wins. You can play against the computer or pass and play with two players, at four difficulty levels (Backyard, Tailgate, League, Pro).

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
    Physics.swift        ballistic flight, landing/sliding, bag-on-bag collisions, hole and edge checks
    ThrowSolver.swift    turns landing + finish markers into the perfect release
    ThrowExecution.swift difficulty levels, meters, how meter errors bend the throw
    Rules.swift          cancellation scoring and the CPU opponent
  Game/
    GameModel.swift      turn and inning flow, 60 fps loop, haptics hooks
    Platform.swift       CADisplayLink driver and haptics
  Views/               SwiftUI: menu, side view, top-down board, meters, scoreboard
```

You can change how the game feels in `Tuning` (`Court.swift`), for example board friction, how much speed a bag keeps on landing, and how bouncy collisions are. You can also change it in `ThrowExecution` (how big a full miss is on each meter) and in `Difficulty` (needle speed, the size of the perfect zone, and CPU accuracy).
