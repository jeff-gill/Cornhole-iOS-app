# Cornhole Throwdown: App Store setup checklist

Everything needed to get the game onto Apple's servers, selling items, and onto test phones through TestFlight.
Work through it top to bottom. Each part says where to do it.

---

## 1. Apple Developer Program (developer.apple.com)

1. Go to **developer.apple.com/programs/enroll** and sign in with your Apple ID.
2. Enroll as an **Individual**: $99 a year. Approval usually takes a day or two.

## 2. Get paid: agreements, tax and bank (App Store Connect)

In-app purchases won't work, **even for testing**, until this is done.

1. Go to **appstoreconnect.apple.com → Business** (older accounts: "Agreements, Tax, and Banking").
2. Accept the **Paid Apps** agreement.
3. Add your **bank account** (where Apple pays you).
4. Fill in the **US tax form (W-9)**.
5. The status should turn **Active**. That can take up to a day.

## 3. Create the app (App Store Connect → Apps → ＋ → New App)

| Field | Value |
|---|---|
| Platform | iOS |
| Name | Cornhole Throwdown |
| Primary language | English (U.S.) |
| Bundle ID | `com.lawnchairgames.cornhole` (if it isn't in the list, first register it at developer.apple.com → Certificates, IDs & Profiles → Identifiers → ＋ → App IDs, ticking **Game Center**, **In-App Purchase** and **iCloud**) |
| SKU | `cornhole-throwdown` (anything; only you see it) |
| User access | Full access |

Then, in the app's **App Information**:
- **Category:** Games → Sports (secondary: Casual)
- **Privacy Policy URL:** https://jeff-gill.github.io/Cornhole-iOS-app/privacy.html
- **Copyright:** © 2026 LawnChair Games

## 4. Game Center (the app → Services → Game Center)

Turn Game Center **on**, then add these leaderboards with these **exact IDs**.

**Classic leaderboards** (all "High score wins", integer):

| Reference name | Leaderboard ID |
|---|---|
| Total Stars | `com.lawnchairgames.cornhole.stars` |
| Wins | `com.lawnchairgames.cornhole.wins` |
| 4-Baggers | `com.lawnchairgames.cornhole.fourbaggers` |

**Season leaderboards**: **recurring** leaderboards, one per title. Each resets on the **1st of every month**, runs **1 month**, "High score wins", integer:

| Title | Leaderboard ID |
|---|---|
| Rookie | `com.lawnchairgames.cornhole.season.t0` |
| Weekend Warrior | `com.lawnchairgames.cornhole.season.t1` |
| Backyard Hero | `com.lawnchairgames.cornhole.season.t2` |
| Local Legend | `com.lawnchairgames.cornhole.season.t3` |
| Semi-Pro | `com.lawnchairgames.cornhole.season.t4` |
| Pro | `com.lawnchairgames.cornhole.season.t5` |
| All-Star | `com.lawnchairgames.cornhole.season.t6` |
| Champion | `com.lawnchairgames.cornhole.season.t7` |
| Hall of Famer | `com.lawnchairgames.cornhole.season.t8` |


## 5. In-app purchases (the app → Monetization → In-App Purchases → ＋)

Create each one with **exactly** this Product ID and type. For each: a display name, a one-line description, the price,
and a review screenshot (a screenshot of the Store page is fine; the same one works for all).

| Product ID | Type | Price | Display name |
|---|---|---|---|
| `com.lawnchairgames.cornhole.coins.small` | Consumable | $0.99 | Handful of Coins |
| `com.lawnchairgames.cornhole.coins.pile` | Consumable | $2.99 | Pile of Coins |
| `com.lawnchairgames.cornhole.coins.medium` | Consumable | $4.99 | Bag of Coins |
| `com.lawnchairgames.cornhole.coins.large` | Consumable | $9.99 | Cooler of Coins |
| `com.lawnchairgames.cornhole.coins.huge` | Consumable | $19.99 | Truckload of Coins |
| `com.lawnchairgames.cornhole.coins.vault` | Consumable | $49.99 | Vault of Coins |
| `com.lawnchairgames.cornhole.caps.80` | Consumable | $0.99 | Handful of Caps |
| `com.lawnchairgames.cornhole.caps.450` | Consumable | $4.99 | Bucket of Caps |
| `com.lawnchairgames.cornhole.caps.1000` | Consumable | $9.99 | Crate of Caps |
| `com.lawnchairgames.cornhole.can.bronze` | Consumable | $0.99 | Bronze Fizz Can |
| `com.lawnchairgames.cornhole.can.silver` | Consumable | $2.99 | Silver Splash Can |
| `com.lawnchairgames.cornhole.can.gold` | Consumable | $4.99 | Golden Pop Can |
| `com.lawnchairgames.cornhole.can.purple` | Consumable | $6.99 | Royal Purple Can |
| `com.lawnchairgames.cornhole.can.platinum` | Consumable | $8.99 | Platinum Sparkle Can |
| `com.lawnchairgames.cornhole.can.diamond` | Consumable | $10.99 | Diamond Dazzle Can |
| `com.lawnchairgames.cornhole.wheel.1` | Consumable | $0.99 | 1 Daily Drop |
| `com.lawnchairgames.cornhole.wheel.3` | Consumable | $1.99 | 3 Daily Drops |
| `com.lawnchairgames.cornhole.wheel.5` | Consumable | $2.99 | 5 Daily Drops |
| `com.lawnchairgames.cornhole.bullseye.1` | Consumable | $0.99 | 1 Bullseye Throw |
| `com.lawnchairgames.cornhole.bullseye.3` | Consumable | $1.99 | 3 Bullseye Throws |
| `com.lawnchairgames.cornhole.bullseye.5` | Consumable | $2.99 | 5 Bullseye Throws |
| `com.lawnchairgames.cornhole.starterpack` | Non-Consumable | $2.99 | Welcome Pack |
| `com.lawnchairgames.cornhole.set.galaxy` | Non-Consumable | $4.99 | Galaxy Set |
| `com.lawnchairgames.cornhole.set.inferno` | Non-Consumable | $3.99 | Inferno Set |
| `com.lawnchairgames.cornhole.trails` | Non-Consumable | $2.99 | Trail Pack |

Notes:
- **Non-Consumable** = bought once, kept forever, comes back with "Restore purchases".
- The **first** batch of in-app purchases is reviewed **together with the first app version**. In App Store Connect, add them to that version under "In-App Purchases and Subscriptions" before you submit it.

## 6. Xcode: sign and upload (on your Mac)

1. Open **Cornhole-LATEST/Cornhole.xcodeproj**.
2. Click the blue **Cornhole** project → target **Cornhole** → **Signing & Capabilities**.
3. Tick **Automatically manage signing** and pick your **Team** (your name).
4. Check the capabilities list shows **Game Center**, **iCloud** (Key-value storage) and **In-App Purchase**. If In-App Purchase is missing, click **＋ Capability** and add it.
5. At the top, set the run destination to **Any iOS Device (arm64)**.
6. Menu **Product → Archive**. When it finishes, the Organizer opens.
7. Click **Distribute App → App Store Connect → Upload** and accept the defaults.
8. Each later upload needs a higher **build number**: target → **General** → **Build**: 1, 2, 3…

## 7. TestFlight: get it onto your phone and friends' phones

After an upload, App Store Connect takes 10–30 minutes to "process" the build, and emails you when it's ready.

**You and up to 100 people on your team (no Apple review):**
1. App Store Connect → the app → **TestFlight** → **Internal Testing** → ＋ group → add yourself (and anyone you've invited to your account under Users and Access).
2. Install the **TestFlight** app from the App Store on your iPhone, open the invite email, tap **View in TestFlight → Install**.

**Friends and family (up to 10,000, by email or a public link):**
1. TestFlight → **External Testing** → ＋ group → add the build.
2. The first build gets a quick **Beta App Review** (usually under a day): fill in "What to Test" and a contact email (gillerillagames@outlook.com).
3. Add testers by email, or turn on a **public link** and text it to people.

## 8. Testing purchases (no real money)

- Purchases inside **TestFlight** are **free**: you'll see a "[Environment: Sandbox]" note and aren't charged.
- To test from Xcode instead, create a **Sandbox Apple Account**: App Store Connect → **Users and Access → Sandbox → Test Accounts → ＋** (use a new email you don't use elsewhere). On the iPhone: **Settings → App Store → Sandbox Account** → sign in with it.
- Things to try: buy a coin pack, a can (it lands in the cooler), a set (then delete and reinstall the game and tap **Restore purchases**), and a cancelled purchase.

## 9. Before you submit for review

- [ ] Screenshots: 6.9" iPhone and 13" iPad (portrait)
- [ ] Description, subtitle, keywords, support URL (https://jeff-gill.github.io/Cornhole-iOS-app/terms.html)
- [ ] Age rating questionnaire: in-app purchases **with random items: yes**; gambling: **no**
- [ ] App Privacy: **Data Not Collected**
- [ ] All in-app purchases above added to the version
- [ ] Creator mode locked to your permanent Game Center ID (send it to Claude once the Temporary-ID warning is gone)
