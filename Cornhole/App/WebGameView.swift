import SwiftUI
import UIKit
import WebKit

/// Hosts the 3D game (Cornhole/Web, built from web/src) full screen.
/// The game's files ship inside the app and are served over app://game/, so it works offline.
struct WebGameView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Messages from the game: career saves, haptic taps, purchases and Game Center.
        let controller = WKUserContentController()
        let handler = WeakMessageHandler(context.coordinator)
        controller.add(handler, name: "save")
        controller.add(handler, name: "haptic")
        controller.add(handler, name: "store")
        controller.add(handler, name: "purchase")
        controller.add(handler, name: "restore")
        controller.add(handler, name: "gamecenter")
        controller.add(handler, name: "score")
        controller.add(handler, name: "leaderboards")
        if let saved = CareerStore.load() {
            controller.addUserScript(WKUserScript(source: "window.__nativeCareer = \(saved);",
                                                  injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        config.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.07, green: 0.125, blue: 0.227, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsLinkPreview = false
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true } // Safari > Develop can inspect the game
        #endif
        context.coordinator.store.webView = webView
        context.coordinator.gameCenter.webView = webView
        if let url = URL(string: "\(BundleSchemeHandler.scheme)://game/index.html") {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler {
        private let haptics = Haptics()
        let store = StoreManager()
        let gameCenter = GameCenter()

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            switch message.name {
            case "save":
                if let json = message.body as? String { CareerStore.save(json) }
            case "haptic":
                haptics.play(message.body as? String ?? "")
            case "store":
                let store = self.store
                Task { await store.loadProducts() }
            case "purchase":
                if let id = message.body as? String {
                    let store = self.store
                    Task { await store.purchase(id) }
                }
            case "restore":
                let store = self.store
                Task { await store.restore() }
            case "gamecenter":
                gameCenter.authenticate()
            case "score":
                if let json = message.body as? String { gameCenter.submit(json) }
            case "leaderboards":
                gameCenter.showLeaderboards()
            default:
                break
            }
        }
    }
}

/// WKUserContentController keeps a strong reference to its handlers; this avoids a retain cycle.
final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) { self.target = target }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

/// Serves the game's bundled files (index.html, three.js, fonts) to the web view.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "app"

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        var name = (url.path as NSString).lastPathComponent
        if name.isEmpty || name == "/" { name = "index.html" }
        let base = (name as NSString).deletingPathExtension
        let ext = (name as NSString).pathExtension
        let fileURL = Bundle.main.url(forResource: base, withExtension: ext)
            ?? Bundle.main.url(forResource: base, withExtension: ext, subdirectory: "Web")
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let headers = ["Content-Type": Self.mimeType(for: ext), "Content-Length": String(data.count), "Cache-Control": "no-cache"]
        if let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) {
            urlSchemeTask.didReceive(response)
        }
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json"
        case "woff2": return "font/woff2"
        case "png": return "image/png"
        case "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}

/// The player's career (coins, stars, gear) as the game's own JSON. It is kept on the device (UserDefaults) and,
/// when the app has the iCloud key-value capability, in the player's iCloud too, so it follows their Apple ID to a new
/// phone with no sign-in screen. Whichever copy was saved most recently wins.
enum CareerStore {
    private static let key = "career.v1"
    private static var cloud: NSUbiquitousKeyValueStore { .default }

    static func load() -> String? {
        cloud.synchronize()
        let local = UserDefaults.standard.string(forKey: key).flatMap(validated)
        let remote = cloud.string(forKey: key).flatMap(validated)
        switch (local, remote) {
        case let (l?, r?): return savedAt(r) > savedAt(l) ? r : l
        default: return local ?? remote
        }
    }

    static func save(_ json: String) {
        guard validated(json) != nil else { return }
        UserDefaults.standard.set(json, forKey: key)
        if json.utf8.count < 900_000 { cloud.set(json, forKey: key) } // iCloud key-value storage holds up to 1 MB
    }

    private static func validated(_ json: String) -> String? {
        guard let data = json.data(using: .utf8), let object = try? JSONSerialization.jsonObject(with: data), object is [String: Any] else { return nil }
        return json
    }

    private static func savedAt(_ json: String) -> Double {
        guard let data = json.data(using: .utf8), let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return 0 }
        return (object["savedAt"] as? NSNumber)?.doubleValue ?? 0
    }
}
