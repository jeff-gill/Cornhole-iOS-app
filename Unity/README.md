# Cornhole Throwdown: Unity version (experiment)

This folder is a trial rebuild of the game in the Unity engine. It lives only on the
`claude/unity-redesign` branch. The current game (web + iPhone app) is on
`claude/cornhole-game-app-hroun0` and isn't changed by anything here.

## What works so far

- **Your real gameplay**, ported from the web game:
  - The physics engine (`Engine.cs`) is a line-for-line translation of `web/src/engine.js`. Test throws give
    identical results in both.
  - Aiming: tap the board where the bag should finish, drag the yellow landing ring (or tap STICK), with the
    landing zone fan and the predicted flight, slide and push paths. Then tap THROW.
  - The throw: pull down anywhere. The power ring fills and the arrow swings. Let go with the ring at the
    green line and the arrow straight. Red is overdrive.
  - A full match against a computer opponent: coin flip for pitcher's boxes, 4 bags each per inning,
    cancellation scoring to 21, banners (SWISH!, CORNHOLE!, 4-BAGGER!), and the 25-second throw clock.
  - The web game's cameras for aiming, throwing, following the bag and watching.
- **Court 1, Backyard BBQ**, rebuilt from the web game's scene (`BackyardScene.cs`): the same trees, bushes,
  flowers, rocks, fence, house, grill, smoker, tables and string lights, plus Unity extras:
  - a thick lawn of grass tufts and flowers, drawn cheaply with GPU instancing
  - the scanned Poly Haven picnic table and chairs
  - real smoke from the grill and smoker
  - bulbs and coals that glow
- **Graphics** (`Look.cs` and the shaders in `Assets/Resources/Shaders/`): sun with soft high-resolution
  shadows, sky and grass-coloured ambient light, the game's gradient sky with sun glow, distance haze,
  smoother edges (4x MSAA), and a finishing pass with bloom, the same ACES film curve as the web game,
  richer colour and soft dark corners.
- **Models**: the web game's glTF models are converted by `Tools/convert_models.py` into
  `Assets/Resources/Models/` (no Unity packages needed). The boards use the Blender frame and legs, and the
  bags are soft filled pillows.

Not yet: the animated people, menus, the other courts, wind, the board check and the shop.

## Trying it

Unity runs on your Mac, not in the cloud session.

1. Install **Unity Hub**, then a **Unity 6** editor from it (the free Personal license is fine).
2. Get this branch onto your Mac (GitHub Desktop: switch to `claude/unity-redesign`).
3. In Unity Hub choose **Add**, then **Add project from disk**, and pick this `Unity` folder.
   If it asks about the editor version, pick the Unity 6 you installed. The first open takes a few minutes.
4. Press **Play** (the ▶ at the top). The court builds itself; no scene needs to be opened.
5. In the Game tab, pick a phone size from the size menu (for example iPhone 15) to see it as on a phone.

## Files

- `Assets/Scripts/Engine.cs`: the physics engine (from web/src/engine.js).
- `Assets/Scripts/Match.cs`: turns, aiming, the throw, the computer opponent, scoring, cameras.
- `Assets/Scripts/AimRig.cs`: the arrow and power ring. `Views.cs`: bags and aiming guides. `Hud.cs`: the on-screen display.
- `Assets/Scripts/Court.cs`, `BackyardScene.cs` and `Board.cs`: the Backyard BBQ and the boards.
- `Assets/Scripts/Look.cs`: lighting, sky, haze and the finishing pass. `ModelLib.cs`: loads the converted models.
- `Tools/convert_models.py`: re-run after changing a model in `web/assets` (`python3 Unity/Tools/convert_models.py`).
- `Assets/Resources/Tex/`: the Poly Haven textures (CC0) the court uses.
- `Assets/Art/`: the rest of the current game's art, for later.
