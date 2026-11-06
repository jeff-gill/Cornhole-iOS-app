# Cornhole Throwdown

*The ultimate cornhole throwdown.*

A 3D cornhole game for iPhone (and the web) with a career tour across 12 courts and live Throwdowns. It's built with three.js, hosted in a native iOS app.

The name and tagline are set in `web/src/game.env`. `web/build.sh` copies them into the splash screen, the clubhouse title, the browser page title and the iPhone app's display name.

## How it plays

- **Career:** eight venues (Backyard, Tailgate Lot, Beach Bar, Brewery Patio, Mountain Lodge, Bonfire Beach, Island Hop, Stadium Finals). The clubhouse shows each one in a slow 360° flyaround with both boards in view. Each one is a new 3D location with stronger wind, a faster aim arrow, a smaller sweet spot, slicker boards and better opponents. A win earns stars and the venue prize, and a loss costs some stars. Stars unlock the next venue.
- **Pro Shop:** spend coins on bags (Accuracy, Control and Spin stats, plus a sticky, neutral or fast slide), board designs, throw effects and cornhole effects. Every coin item can also be unlocked by collecting its cards from cans.
- **Cans:** win a match to get a can (the cooler holds 4), plus one free can a day. There are eight tiers, from Backyard Black to Diamond Reserve, plus rare Express Shot cans. Rarer cans hold more prizes (coins, item cards, now and then a life) and take longer to open: 15 minutes for Black up to 24 hours for Diamond. Only one can opens at a time, and Express cans open right away. Each of your cornholes in a match improves the odds of a better can. Opening one sprays mist and the prizes pop out one at a time.
- **Lives (🎟️ raffle tickets):** up to 5. A match uses one, and a win gives it back. One refills every hour. Extra tickets come from the Store, from coins (at a steep price), from 15 bottle caps, or rarely from a can. The iPhone app can notify you when they're full.
- **Bottle caps:** the premium currency (a red cap with a star). Use them to open a can now (1 cap for every 10 minutes left) or to buy a ticket. You start with 20, get some from cans (more often from rare ones) and 3 per 4-bagger, and can buy packs in the Store.
- **Avatars:** 4 to start, and 2 more with each court you open.
- **Aiming:** tap where the bag should finish, then drag the landing ring around the gold zone. Near the finish it sticks, farther back it slides, and off to the side it adds spin.
- **Throwing:** one move. Pull back for power, and the arrow swings faster the harder you pull. Let go in the gold band with the arrow straight. Pulling into overdrive makes the throw wild.
- **Wind:** steady for each inning, from any direction, and stronger at higher venues. The aiming guide ignores it.
- **Other rules:**
  - Pitcher's boxes are assigned by coin flip each match.
  - If one of your own bags is in the way, a push shot shoves it along your line.
  - Scoring uses cancellation scoring to 21.
  - Sinking all four bags in one inning is a 4-BAGGER.
- **Pass & Play** for two people on one phone.
- **Throwdowns (live matches):** PLAY looks for a real player at the same court through Game Center for 15 seconds. If nobody is found, you play a computer opponent (tagged CPU). Online, the thrower's phone sends each throw with a luck seed, so both phones play it the same way, and then sends the final bag positions. Leaving a match forfeits it. After a Throwdown both players can tap THROWDOWN REMATCH to play again at the same court.
- **Throw clock:** 25 seconds a throw in career and live matches (not Pass & Play or the tutorial). If it runs out, the bag is lost.
- **Game Center:** players are signed in automatically. Their stars, wins and 4-baggers go to the leaderboards (the 🏆 RANKINGS button).

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

## Before publishing

In Xcode, open the Cornhole target, then Signing & Capabilities, and add:

- **Game Center**, for sign-in and leaderboards.
- **iCloud** with **Key-value storage** ticked, so a player's career follows their Apple ID to a new phone.
- **In-App Purchase**.

In App Store Connect:

- Under Features > Game Center, create three leaderboards (classic, high score, best score kept):
  - `com.jeffgill.cornhole.stars`
  - `com.jeffgill.cornhole.wins`
  - `com.jeffgill.cornhole.fourbaggers`
- Create the in-app purchases listed in `Cornhole/App/StoreManager.swift`.

## Economy

The aim is slow, earned progress: no easy maxing out and no runaway bank balance.

| Source or sink | Amount |
|---|---|
| Match | Both pay the buy-in, and the winner takes the pot (net +1 buy-in, or −1 if you lose) |
| Win | Pot, stars, a can (if the cooler has room) and your life back |
| Loss | Buy-in, stars and a life |
| 4-bagger | Half a buy-in |
| Daily | A free can (mostly Black or White) |
| Ticket (life) for coins | 3 buy-ins at your highest open court |
| Ticket (life) for caps | 15 caps |
| Open a can now | 1 cap per 10 minutes left |
| Caps from cans | chance 8% (Black) to 57% (Diamond); 1–3 caps (Black) to 15–29 (Diamond) |
| Caps per 4-bagger | 3 |
| Duplicate card | 0.25% of the item's price per card |

At an even win rate, coins barely grow, and a court's winnings buy the shop tier or two that match it.

**Cans.** Chance per win and contents. Coins are counted in buy-ins of the court where the can was won.

| Can | Chance | Prizes | Coins | Cards | Life chance per prize | Time to open |
|---|---|---|---|---|---|---|
| Backyard Black | 40% | 2 | 0.2–0.5 | 2–4 | 1% | 15 min |
| Picnic White | 25% | 3 | 0.3–0.8 | 4–7 | 1.5% | 1 h |
| Bronze Lager | 15% | 3 | 0.5–1.2 | 6–10 | 2% | 2 h |
| Silver Stout | 10.5% | 4 | 0.8–2 | 10–16 | 3% | 3 h |
| Golden Ale | 6% | 5 | 1.5–3.5 | 16–26 | 4% | 5 h |
| Royal Purple | 2.4% | 6 | 2.5–5 | 26–40 | 5% | 8 h |
| Platinum Pils | 0.9% | 7 | 4–8 | 40–60 | 6% | 12 h |
| Diamond Reserve | 0.2% | 8 | 6–12 | 60–90 | 8% | 24 h |
| Express Shot | 3% | 3 | 0.5–1.5 | 6–12 | 3% | Instant |

Rolls are skewed toward the low end of each range, so a rare can is usually good but not always. Each of your cornholes in the match (up to 30) multiplies a tier's chance by 1.012 per rank above Black: 20 cornholes make a Diamond about 4.5 times as likely.

**Cards needed** to unlock an item go from 3 (the cheapest item in its tab) to 90 (the most expensive), and the steps get bigger near the top. Cards for cheap items are common; rarer cans reach further up the list.

The odds are not shown in the game. The App Store requires the odds for paid loot boxes to be shown before purchase. Before submitting, either show the odds next to the paid cans in the Store, or remove the paid cans.
