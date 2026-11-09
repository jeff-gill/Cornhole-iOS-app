# Cornhole Throwdown

*The ultimate cornhole throwdown.*

A 3D cornhole game for iPhone (and the web) with a career tour across 12 courts and live Throwdowns. It's built with three.js, hosted in a native iOS app.

The name and tagline are set in `web/src/game.env`. `web/build.sh` copies them into the splash screen, the clubhouse title, the browser page title and the iPhone app's display name.

## How it plays

- **Career:** twelve courts (courts 9–12 show "Coming soon" until released; remove `soon: true` in `web/src/g1_flow.js` to release one) (Backyard BBQ, Tailgate Lot, Beach Shack, Pizza Patio, Mountain Lodge, Golf Club, Island Hop, City Rooftop, Lakeside Dock, Desert Canyon, County Fair, Stadium Finals). The clubhouse shows each one in a slow 360° flyaround with both boards in view. Each one is a new 3D location with a smaller sweet spot, wind that builds a little at every court (up to 10 mph), slicker boards and better opponents. The aim arrow swings at the same speed on every court. A win earns stars and the venue prize, and a loss costs some stars. Stars unlock the next venue.
- **Pro Shop:** spend coins on bags (Accuracy, Control and Spin stats, plus a sticky, neutral or fast slide), board designs, throw effects and cornhole effects. Every coin item can also be unlocked by collecting its cards from cans.
- **Cans:** win a match to get a can (the cooler holds 4), plus one free can a day. There are eight tiers, from Backyard Black to Diamond Dazzle, plus rare Express Pop cans. Rarer cans hold more prizes (coins, item cards, now and then a life) and take longer to open: 15 minutes for Black up to 24 hours for Diamond. Only one can opens at a time, and Express cans open right away. Each of your cornholes in a match improves the odds of a better can. Opening one sprays mist and the prizes pop out one at a time.
- **Lives (🎟️ raffle tickets):** up to 5. A match uses one, and a win gives it back. One refills every hour. Extra tickets come from the Store, from coins (at a steep price), from 15 bottle caps, or rarely from a can. The iPhone app can notify you when they're full.
- **Bottle caps:** the premium currency (a red cap with a star). Use them to open a can now (1 cap for every 10 minutes left) or to buy a ticket. You start with 20, get some from cans (more often from rare ones) and 3 per 4-bagger, and can buy packs in the Store.
- **Profile (tap your avatar):** three tabs.
  - **Avatar:** 25 hats and helmets on their own (ball cap, devil helmet, cowboy hat, police hat, fireman helmet, tiara, crown, astronaut helmet and more; several feminine picks), made in Blender (`web/tools/blender/hats.py`). 4 to start, 3 more with each court you open through Court 8. Your Game Center picture is the default when you have one.
  - **Profile:** your handle and stats. New players are "guest-" plus 10 digits, or their Game Center name, until they choose a handle (3–16 letters, numbers, dots, dashes or underscores). Live opponents see your handle.
  - **Settings:** music and sound effects on/off and volume, haptics, and alerts.
- **Computer opponents** and the CPU players in season groups use player-style handles (for example SliderSam22) and aren't labeled; How to play mentions that you play a computer opponent when no one is available.
- **New-item badges:** red number badges lead from the SHOP button to the tab to the item when cards from cans unlock it (NEW!). Viewing a tab clears its badges.
- **Card discount:** cards collected toward an item take up to 30% off its coin price, growing slowly (squared), so half the cards is only 7.5% off.
- **Aiming:** tap where the bag should finish, then drag the landing ring around the gold zone. Near the finish it sticks, farther back it slides, and off to the side it adds spin.
- **Throwing:** one move. Pull back for power, and the arrow swings faster the harder you pull. Let go in the gold band with the arrow straight. Pulling into overdrive makes the throw wild.
- **Wind:** set at the start of each match and steady for the whole match (never more than 10 mph), and you can see it: faint streaks drift across the court in its direction, more and faster the stronger it blows, from any direction, and stronger at higher venues. The aiming guide ignores it.
- **Other rules:**
  - Pitcher's boxes are assigned by coin flip each match.
  - If one of your own bags is in the way, a push shot shoves it along your line.
  - Scoring uses cancellation scoring to 21.
  - Sinking all four bags in one inning is a 4-BAGGER.
- **Pass & Play** for two people on one phone.
- **Throwdowns (live matches):** PLAY looks for a real player at the same court through Game Center for 15 seconds. If nobody is found, you play a computer opponent (tagged CPU). Online, the thrower's phone sends each throw with a luck seed, so both phones play it the same way, and then sends the final bag positions. Leaving a match forfeits it. After a Throwdown both players can tap THROWDOWN REMATCH to play again at the same court.
- **Seasons:** each calendar month (UTC) is a season. There are nine titles, from Rookie up to Hall of Famer, and each title is a worldwide league (a Game Center leaderboard, free with no server) split into groups of 100 or fewer. A win earns the court's win stars in season points, and a loss earns 1 point for playing. Moving up gets harder the higher you go:

  | Title | Moves up | Moves down |
  |---|---|---|
  | Rookie | Top 20% | (lowest title) |
  | Weekend Warrior | Top 20% | Bottom 20% |
  | Backyard Hero | Top 15% | Bottom 20% |
  | Local Legend | Top 15% | Bottom 20% |
  | Semi-Pro | Top 10% | Bottom 20% |
  | Pro | Top 10% | Bottom 25% |
  | All-Star | Top 5% | Bottom 25% |
  | Champion | Top 2% | Bottom 30% |
  | Hall of Famer | (top title) | Bottom 30% |

  - Promotion also needs at least 10 matches in the season.
  - Not playing only costs a title in the top three titles (All-Star, Champion, Hall of Famer). Lower down, sitting out leaves you where you are.
  - The group standings shade the promotion zone green and the demotion zone red.
  - **Season prizes:** the top 20 in each group win a can: Platinum Sparkle for 1st, Golden Pop for 2nd, Silver Splash for 3rd and Backyard Black for 4th–20th. Each title above Rookie moves every prize up one can (up to Diamond Dazzle). Prize cans skip the cooler limit.
  - **Title perk:** each title above Rookie adds 5% more cards to every can you open (+40% at Hall of Famer).
  - While leagues are small, CPU players fill the first two titles: Rookie groups up to 100 and Weekend Warrior groups up to 50, none above that, and none once a league has that many real players. Every phone generates the same CPUs from the season and title, and they're tagged CPU in the standings.
  - Every phone loads the league and shuffles it into the same groups using a hash of each player's ID and the season. Without Game Center (the browser preview), Rookie and Weekend Warrior are judged against the CPU group and higher titles against fixed point lines.
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
- Create nine **recurring** leaderboards for the season leagues, `com.jeffgill.cornhole.season.t0` (Rookie) through `com.jeffgill.cornhole.season.t8` (Hall of Famer). Set each to restart monthly on the 1st (UTC), and keep the best score.

## Economy

The aim is slow, earned progress: no easy maxing out and no runaway bank balance.

| Source or sink | Amount |
|---|---|
| Match | Both pay the buy-in, and the winner takes the pot (net +1 buy-in, or −1 if you lose) |
| Win | Pot, stars, a can (if the cooler has room) and your life back |
| Loss | Buy-in, stars and a life |
| 4-bagger | Half a buy-in |
| Daily | A free can (mostly Black or White) |
| Ticket (life) for coins | Set by your season title: 100, 250, 600, 1.5K, 4K, 10K, 25K, 60K, 150K (Rookie to Hall of Famer), but never more than a tenth of a buy-in at your highest open court |
| Ticket (life) for caps | 15 caps |
| Open a can now | 1 cap per 10 minutes left |
| Caps from cans | chance 8% (Black) to 57% (Diamond); 1–3 caps (Black) to 15–29 (Diamond) |
| Caps per 4-bagger | 3 |
| Duplicate card | 0.1% of the item's price per card |

At an even win rate, coins barely grow, and a court's winnings buy the shop tier or two that match it.

**Cans.** Chance per win and contents. Coins are counted in buy-ins of the court where the can was won.

| Can | Chance | Prizes | Coins | Cards | Life chance per prize | Time to open |
|---|---|---|---|---|---|---|
| Backyard Black | 40% | 2 | 0.05–0.15 | 2–4 | 1% | 15 min |
| Picnic White | 25% | 3 | 0.08–0.2 | 4–7 | 1.5% | 1 h |
| Bronze Fizz | 15% | 3 | 0.12–0.3 | 6–10 | 2% | 2 h |
| Silver Splash | 10.5% | 4 | 0.2–0.4 | 10–16 | 3% | 3 h |
| Golden Pop | 6% | 5 | 0.3–0.6 | 16–26 | 4% | 5 h |
| Royal Purple | 2.4% | 6 | 0.45–0.8 | 26–40 | 5% | 8 h |
| Platinum Sparkle | 0.9% | 7 | 0.6–1.1 | 40–60 | 6% | 12 h |
| Diamond Dazzle | 0.2% | 8 | 0.8–1.5 | 60–90 | 8% | 24 h |
| Express Pop | 3% | 3 | 0.12–0.3 | 6–12 | 3% | Instant |

Rolls are skewed toward the low end of each range, so a rare can is usually good but not always. Each of your cornholes in the match (up to 30) multiplies a tier's chance by 1.012 per rank above Black: 20 cornholes make a Diamond about 4.5 times as likely.

**Cards needed** to unlock an item go from 3 (the cheapest item in its tab) to 90 (the most expensive), and the steps get bigger near the top. Cards for cheap items are common; rarer cans reach further up the list.

The odds are not shown in the game. The App Store requires the odds for paid loot boxes to be shown before purchase. Before submitting, either show the odds next to the paid cans in the Store, or remove the paid cans.

### Boards in play
- Each match is played on either your board or your opponent's, picked at random (live matches agree through the
  shared seed). Every board has two traits, different rather than better: surface (Sticky, Grippy, Normal, Fast, Slick:
  how far bags slide) and bounce (Soft, Normal, Lively).
- Before the first throw, a Board check splash shows the board and gives each player 20 seconds to pick a bag (the best one for the board is picked for you) (the
  throw clock hasn't started yet). It warns about pairings that pull the same way, like a fast bag on a fast board.
- While you pick your finish and landing spots, a small card shows the board and its traits.

### Glitch protection
- A career match is remembered from the buy-in until it ends. If the game freezes (a bag that never lands, a throw
  clock that stops counting, a CPU that never throws, or the game loop dying) the watchdog stops the match and refunds
  the buy-in and the ticket; no stars are lost.
- Leaving the app mid-match (switching apps, locking the phone) doesn't end it: the throw clock keeps running while
  you're away, and when you come back the time is taken off your turns (each turn that runs out loses that bag).
  Four of your bags lost to the clock in one inning loses the match.
- If the app is closed while you're out of it (force quit, iPhone closing it to free memory, power off), the next
  launch counts the match as a quit: a loss. The Backyard BBQ forgives this 3 times, with a warning each time.
- If the game crashes or freezes while it's on screen, the match is refunded (buy-in and ticket back, no stars lost).
- Quitting from the pause menu is still a loss.
- Pausing on your throw: the first pause of a match stops the throw clock for 5 seconds, then it runs again; later
  pauses leave it running, with a warning on the pause screen. A bag lost to the clock shows as a red ✕ in your tile.

## Blender pipeline

Custom 3D art is made with Blender scripts in `web/tools/blender/`, so it can be regenerated or tweaked at any time. Each script builds models, bakes soft shading (ambient occlusion) into their vertex colors with Cycles, and exports them to `web/assets/blender/` as single `.json` glTF files.

- `trees.py`: the stylized oak, maple and pine trees used in the Backyard.
- `hats.py`: the 25 headgear avatars, rendered to transparent PNGs in `web/assets/hats/`. Pass names after `--` to re-render only some.
- `people.py`: converts the Quaternius character packs (`quaternius/`) into animated glTF people (not used in the game yet).
- `board.py`: the board's frame (rounded 2x4 rails, brace, bolt heads) and splayed legs with a cross brace. The frame takes each board design's color. The painted top stays in the game and gets Poly Haven plywood grain.

Run from the repo root (needs Blender 4 with numpy for the glTF exporter), then rebuild:

```
blender -b --python web/tools/blender/trees.py
web/build.sh
```
