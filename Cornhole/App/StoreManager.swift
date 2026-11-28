import Foundation
import StoreKit
import WebKit

/// In-app purchases (StoreKit 2) for the game's Store tab. The web game asks for prices, purchases and restores
/// through the "store", "purchase" and "restore" messages; results go back via window.__storePrices,
/// window.__purchaseComplete and window.__restoreDone.
///
/// Product IDs must match those created in App Store Connect (and in a StoreKit configuration file for testing).
final class StoreManager {
    static let productIDs = [
        "com.lawnchairgames.cornhole.coins.small",
        "com.lawnchairgames.cornhole.coins.pile",
        "com.lawnchairgames.cornhole.coins.medium",
        "com.lawnchairgames.cornhole.coins.large",
        "com.lawnchairgames.cornhole.coins.huge",
        "com.lawnchairgames.cornhole.coins.vault",
        "com.lawnchairgames.cornhole.starterpack",
        "com.lawnchairgames.cornhole.set.galaxy",
        "com.lawnchairgames.cornhole.set.inferno",
        "com.lawnchairgames.cornhole.trails",
        "com.lawnchairgames.cornhole.caps.80",
        "com.lawnchairgames.cornhole.caps.450",
        "com.lawnchairgames.cornhole.caps.1000",
        "com.lawnchairgames.cornhole.can.bronze",
        "com.lawnchairgames.cornhole.can.silver",
        "com.lawnchairgames.cornhole.can.gold",
        "com.lawnchairgames.cornhole.can.purple",
        "com.lawnchairgames.cornhole.can.platinum",
        "com.lawnchairgames.cornhole.can.diamond",
        "com.lawnchairgames.cornhole.wheel.1",
        "com.lawnchairgames.cornhole.wheel.3",
        "com.lawnchairgames.cornhole.wheel.5",
        "com.lawnchairgames.cornhole.bullseye.1",
        "com.lawnchairgames.cornhole.bullseye.3",
        "com.lawnchairgames.cornhole.bullseye.5",
    ]

    weak var webView: WKWebView?
    private var products: [String: Product] = [:]
    private var updatesTask: Task<Void, Never>?
    /// Coin packs can be bought many times; remember which transactions were already paid out.
    private var delivered: Set<UInt64> = Set((UserDefaults.standard.array(forKey: "store.delivered") as? [NSNumber] ?? []).map { $0.uint64Value })

    init() {
        // Purchases that finish outside the app (Ask to Buy, interrupted purchases) arrive here.
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                await self?.handle(result, restored: false)
            }
        }
    }

    deinit { updatesTask?.cancel() }

    func loadProducts() async {
        guard let list = try? await Product.products(for: Self.productIDs) else { return }
        products = Dictionary(uniqueKeysWithValues: list.map { ($0.id, $0) })
        var prices = Dictionary(uniqueKeysWithValues: list.map { ($0.id, $0.displayPrice) })
        // the App Store country (e.g. "BEL"): the game doesn't sell random-prize cans where that isn't allowed
        if let country = await Storefront.current?.countryCode { prices["__country"] = country }
        if let data = try? JSONSerialization.data(withJSONObject: prices), let json = String(data: data, encoding: .utf8) {
            await callJS("window.__storePrices && window.__storePrices(\(json));")
        }
    }

    func purchase(_ id: String) async {
        if products.isEmpty { await loadProducts() }
        guard let product = products[id] else {
            await report(id, ok: false, message: "That item isn't available right now.")
            return
        }
        do {
            switch try await product.purchase() {
            case .success(let verification):
                await handle(verification, restored: false)
            case .userCancelled:
                await report(id, ok: false, message: "")
            case .pending:
                await report(id, ok: false, message: "Waiting for approval…")
            @unknown default:
                await report(id, ok: false, message: "")
            }
        } catch {
            await report(id, ok: false, message: "The purchase didn't go through. Please try again.")
        }
    }

    /// Re-delivers one-time purchases (Starter Pack, sets, trails). Coin packs are consumable and aren't restored.
    func restore() async {
        try? await AppStore.sync()
        var count = 0
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result {
                await report(transaction.productID, ok: true, message: "", restored: true)
                count += 1
            }
        }
        await callJS("window.__restoreDone && window.__restoreDone(\(count));")
    }

    private func handle(_ result: VerificationResult<Transaction>, restored: Bool) async {
        guard case .verified(let transaction) = result else { return } // ignore anything that fails Apple's verification
        if transaction.revocationDate == nil, !delivered.contains(transaction.id) {
            delivered.insert(transaction.id)
            UserDefaults.standard.set(delivered.map { NSNumber(value: $0) }, forKey: "store.delivered")
            await report(transaction.productID, ok: true, message: "", restored: restored)
        }
        await transaction.finish()
    }

    private func report(_ id: String, ok: Bool, message: String, restored: Bool = false) async {
        let args = [id, message].compactMap { s -> String? in
            guard let data = try? JSONSerialization.data(withJSONObject: [s]), let json = String(data: data, encoding: .utf8) else { return nil }
            return String(json.dropFirst().dropLast()) // a safely quoted JS string
        }
        guard args.count == 2 else { return }
        await callJS("window.__purchaseComplete && window.__purchaseComplete(\(args[0]), \(ok), \(args[1]), \(restored));")
    }

    private func callJS(_ script: String) async {
        await MainActor.run { [weak self] in
            self?.webView?.evaluateJavaScript(script, completionHandler: nil)
        }
    }
}
