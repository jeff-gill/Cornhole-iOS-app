import GameKit
import UIKit
import WebKit

/// Game Center: signs the player in (most iPhone owners already are), posts their career to the leaderboards and
/// opens Apple's leaderboard screen. The web game hears about the player through window.__gcPlayer.
///
/// Leaderboard IDs must match the ones created in App Store Connect (Features > Game Center).
final class GameCenter: NSObject, GKGameCenterControllerDelegate {
    static let leaderboards = [
        "stars": "com.jeffgill.cornhole.stars",            // total career stars
        "wins": "com.jeffgill.cornhole.wins",              // career wins
        "fourBaggers": "com.jeffgill.cornhole.fourbaggers", // 4-baggers thrown
    ]

    weak var webView: WKWebView?
    private var started = false

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
