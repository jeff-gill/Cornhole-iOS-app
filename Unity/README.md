# Cornhole Throwdown: Unity version (experiment)

This folder is a trial rebuild of the game in the Unity engine. It lives only on the
`claude/unity-redesign` branch. The current game (web + iPhone app) is on
`claude/cornhole-game-app-hroun0` and isn't changed by anything here.

## What's here so far

- `Assets/Art/`: copies of the current game's art. These are the Blender models, trees,
  people, 25 hats, Poly Haven textures (all CC0), and the Lilita One and Nunito fonts (OFL).
  The `.json` models are glTF files, which Unity reads once the free glTFast package is installed.

## Opening it

Unity runs on your Mac, not in the cloud session, so previews have to be viewed there.

1. Install Unity Hub and a Unity 6 editor (the free Personal license is fine).
2. In Unity Hub, choose Add, then Add project from disk, and pick this `Unity` folder.
