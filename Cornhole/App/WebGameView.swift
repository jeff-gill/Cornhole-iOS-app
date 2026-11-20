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
        controller.add(handler, name: "net")
        controller.add(handler, name: "notify")
        controller.add(handler, name: "season")
        controller.add(handler, name: "open")
        // the trusted clock for timers (changing the phone's clock doesn't skip a wait); refreshed from the network below
        controller.addUserScript(WKUserScript(source: "window.__clockOffset = \(TrustedClock.offset());",
                                              injectionTime: .atDocumentStart, forMainFrameOnly: true))
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
        context.coordinator.webView = webView
        context.coordinator.syncClock()
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
        weak var webView: WKWebView?

        override init() {
            super.init()
            let center = NotificationCenter.default
            // back from the background: the phone's clock may have been changed meanwhile
            center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in self?.syncClock() }
            center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in CareerStore.uploadToGameCenter() }
        }

        /// Sends the game the trusted clock's offset now, then again once the network time is in.
        func syncClock() {
            webView?.evaluateJavaScript("window.__clockOffset = \(TrustedClock.offset());", completionHandler: nil)
            TrustedClock.sync { [weak self] offset in
                self?.webView?.evaluateJavaScript("window.__clockOffset = \(offset);", completionHandler: nil)
            }
        }

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
                if message.body as? String == "signin-now" { gameCenter.signIn() } else { gameCenter.authenticate() }
            case "score":
                if let json = message.body as? String { gameCenter.submit(json) }
            case "leaderboards":
                gameCenter.showLeaderboards()
            case "net":
                if let json = message.body as? String { gameCenter.net(json) }
            case "season":
                if let json = message.body as? String { gameCenter.season(json) }
            case "open": // the privacy policy and terms, in Safari (only https web pages)
                if let text = message.body as? String, let url = URL(string: text), url.scheme == "https" {
                    UIApplication.shared.open(url)
                }
            case "notify":
                if let json = message.body as? String { LivesAlert.handle(json) }
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
        case "jpg", "jpeg": return "image/jpeg"
        case "gltf": return "model/gltf+json"
        case "bin", "hdr": return "application/octet-stream"
        case "txt": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
}

