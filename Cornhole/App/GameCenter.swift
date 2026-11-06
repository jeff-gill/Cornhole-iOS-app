import GameKit
import UIKit
import WebKit

/// Game Center: signs the player in (most iPhone owners already are), posts their career to the leaderboards and
/// opens Apple's leaderboard screen. The web game hears about the player through window.__gcPlayer.
///
/// It also runs live matches: the game asks to find a player in the same court (a Game Center player group), and
/// the two phones then pass small JSON messages (throws, final bag spots) through the match.
///
/// Leaderboard IDs must match the ones created in App Store Connect (Features > Game Center).
final class GameCenter: NSObject, GKGameCenterControllerDelegate, GKMatchDelegate {
    static let leaderboards = [
        "stars": "com.jeffgill.cornhole.stars",            // total career stars
        "wins": "com.jeffgill.cornhole.wins",              // career wins
        "fourBaggers": "com.jeffgill.cornhole.fourbaggers", // 4-baggers thrown
    ]

    weak var webView: WKWebView?
    private var started = false
    private var match: GKMatch?
    private var searching = false

    /// Call once the page has loaded. If the player isn't signed in, iOS shows its own sign-in sheet (once).
    func authenticate() {
        guard !started else { reportPlayer(); return }
        started = true
        GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, _ in
            if let viewController { Self.topViewController()?.present(viewController, animated: true) }
            self?.reportPlayer()
        }
    }

    /// Body is JSON from the game, e.g. {"stars": 42, "wins": 7, "fourBaggers": 1}.
    func submit(_ json: String) {
        guard GKLocalPlayer.local.isAuthenticated,
              let data = json.data(using: .utf8),
              let values = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        for (key, id) in Self.leaderboards {
            guard let value = (values[key] as? NSNumber)?.intValue, value > 0 else { continue }
            GKLeaderboard.submitScore(value, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id]) { _ in }
        }
    }

    func showLeaderboards() {
        guard GKLocalPlayer.local.isAuthenticated else {
            callJS("window.__gcMessage && window.__gcMessage('Sign in to Game Center in Settings to see the leaderboards.')")
            return
        }
        let vc = GKGameCenterViewController(state: .leaderboards)
        vc.gameCenterDelegate = self
        Self.topViewController()?.present(vc, animated: true)
    }

    func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }

    // MARK: Live matches

    /// Body is JSON from the game: {"op":"find","group":3}, {"op":"cancel"}, {"op":"send","data":"..."} or {"op":"leave"}.
    func net(_ body: String) {
        guard let data = body.data(using: .utf8),
              let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let op = msg["op"] as? String else { return }
        switch op {
        case "find": find(group: (msg["group"] as? NSNumber)?.intValue ?? 0)
        case "cancel":
            searching = false
            GKMatchmaker.shared().cancel()
        case "send":
            if let text = msg["data"] as? String, let match {
                try? match.sendData(toAllPlayers: Data(text.utf8), with: .reliable)
            }
        case "leave": endMatch()
        default: break
        }
    }

    private func find(group: Int) {
        endMatch()
        guard GKLocalPlayer.local.isAuthenticated else { sendToGame(["t": "nomatch"]); return } // play a CPU instead
        let request = GKMatchRequest()
        request.minPlayers = 2
        request.maxPlayers = 2
        request.playerGroup = group // only players at the same court
        searching = true
        GKMatchmaker.shared().findMatch(for: request) { [weak self] match, error in
            DispatchQueue.main.async {
                guard let self, self.searching else { match?.disconnect(); return }
                guard let match, error == nil else { self.searching = false; self.sendToGame(["t": "nomatch"]); return }
                self.searching = false
                self.match = match
                match.delegate = self
                if match.expectedPlayerCount == 0 { self.matched(match) }
            }
        }
    }

    private func matched(_ match: GKMatch) {
        guard let opponent = match.players.first else { return }
        // Both phones agree on who sets up the match: the lower player ID hosts.
        let host = GKLocalPlayer.local.gamePlayerID < opponent.gamePlayerID
        sendToGame(["t": "matched", "host": host, "name": opponent.displayName])
    }

    private func endMatch() {
        match?.delegate = nil
        match?.disconnect()
        match = nil
    }

    func match(_ match: GKMatch, player: GKPlayer, didChange state: GKPlayerConnectionState) {
        DispatchQueue.main.async { [weak self] in
            guard let self, match === self.match else { return }
            switch state {
            case .connected: if match.expectedPlayerCount == 0 { self.matched(match) }
            case .disconnected: self.sendToGame(["t": "left"]); self.endMatch()
            default: break
            }
        }
    }

    func match(_ match: GKMatch, didFailWithError error: Error?) {
        DispatchQueue.main.async { [weak self] in self?.sendToGame(["t": "left"]); self?.endMatch() }
    }

    /// The opponent's message is handed to the game as a quoted string and parsed there, never run as code.
    func match(_ match: GKMatch, didReceive data: Data, fromRemotePlayer player: GKPlayer) {
        guard let text = String(data: data, encoding: .utf8), text.count < 200_000,
              let quoted = try? JSONSerialization.data(withJSONObject: [text]),
              let array = String(data: quoted, encoding: .utf8) else { return }
        callJS("(function(){ try { var m = JSON.parse(\(array)[0]); window.__net && window.__net(m); } catch (e) {} })()")
    }

    private func sendToGame(_ object: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object), let json = String(data: data, encoding: .utf8) else { return }
        callJS("window.__net && window.__net(\(json))")
    }

    private func reportPlayer() {
        let player = GKLocalPlayer.local
        guard player.isAuthenticated else { callJS("window.__gcPlayer && window.__gcPlayer(null)"); return }
        let info = ["name": player.displayName, "id": player.gamePlayerID]
        guard let data = try? JSONSerialization.data(withJSONObject: info), let json = String(data: data, encoding: .utf8) else { return }
        callJS("window.__gcPlayer && window.__gcPlayer(\(json))")
    }

    private func callJS(_ script: String) {
        DispatchQueue.main.async { [weak self] in self?.webView?.evaluateJavaScript(script, completionHandler: nil) }
    }

    private static func topViewController() -> UIViewController? {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }
        var top = window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
