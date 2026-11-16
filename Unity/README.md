# Cornhole Throwdown: Unity version (experiment)

This folder is a trial rebuild of the game in the Unity engine. It lives only on the
`claude/unity-redesign` branch. The current game (web + iPhone app) is on
`claude/cornhole-game-app-hroun0` and isn't changed by anything here.

## What works so far

- **Court 1, Backyard BBQ**, built all the way around: lawn, wooden fence, the home behind the
  target board, neighbours' houses, trees, a brick patio with a picnic table and grill, lawn chairs.
- **Regulation boards**: 2 ft x 4 ft, 27 ft apart, sloped, with a real 6" hole 9" from the back.
- **Throwing a bag**: press anywhere and pull down for power. The arrow on the grass swings side
  to side, faster the harder you pull (it turns gold when it's straight). Let go with the power in the
  gold band on the meter. Pulling into the red overdrive zone makes the throw wild.
- **Scoring**: 3 in the hole, 1 on the board, 4 bags a round, then THROW AGAIN.

Not yet: menus, the other courts, opponents, wind, and the shop. The art in `Assets/Art/` (trees,
people, hats) isn't in the scene yet; the court uses simple shapes plus Poly Haven textures.

## Trying it

Unity runs on your Mac, not in the cloud session.

1. Install **Unity Hub**, then a **Unity 6** editor from it (the free Personal license is fine).
2. Get this branch onto your Mac (GitHub Desktop: switch to `claude/unity-redesign`).
3. In Unity Hub choose **Add**, then **Add project from disk**, and pick this `Unity` folder.
   If it asks about the editor version, pick the Unity 6 you installed. The first open takes a few minutes.
4. Press **Play** (the ▶ at the top). The court builds itself; no scene needs to be opened.
5. In the Game tab, pick a phone size from the size menu (for example iPhone 15) to see it as on a phone.

## Files

- `Assets/Scripts/Court.cs`: builds the Backyard BBQ.
- `Assets/Scripts/Board.cs`: the boards, including the top with the round hole.
- `Assets/Scripts/Bag.cs`: bag physics (no bounce, short slide, drops in the hole) and scoring.
- `Assets/Scripts/ThrowController.cs`: the pull-back throw, aim arrow, power meter and score display.
- `Assets/Resources/Tex/`: the Poly Haven textures (CC0) the court uses.
- `Assets/Art/`: the rest of the current game's art, for later.
