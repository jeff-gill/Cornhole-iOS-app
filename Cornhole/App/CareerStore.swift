import CryptoKit
import Foundation
import GameKit

/// The player's career (coins, stars, gear) as the game's own JSON.
///
/// Where it lives:
/// - on the device (UserDefaults), for a fast start;
/// - in the player's iCloud key-value store, so it follows their Apple Account;
/// - in their Game Center account as a saved game, so signing in to Game Center on a new iPhone or iPad brings it back.
/// Whichever copy was saved most recently (the game's trusted clock) wins.
///
/// Every copy is sealed with a signature only this app can make, so a save edited outside the game (in a backup, say)
/// is refused instead of loaded.
enum CareerStore {
    private static let key = "career.v2"
    private static let savedGameName = "career"
    private static var cloud: NSUbiquitousKeyValueStore { .default }

    // MARK: Loading

    /// The newest valid career on this device or in iCloud (the Game Center copy arrives later; see fetchFromGameCenter).
    static func load() -> String? {
        cloud.synchronize()
        let local = UserDefaults.standard.string(forKey: key).flatMap(unseal)
        let remote = cloud.string(forKey: key).flatMap(unseal)
        #if DEBUG
        // test builds only: carry over a career saved before saves were sealed
        if local == nil, remote == nil, let old = UserDefaults.standard.string(forKey: "career.v1") { return validated(old) }
        #endif
        return newest([local, remote])
    }

    /// Once the player is signed in to Game Center: the saved game in their account, if it is valid. The game only
    /// switches to it if it is newer than the career it already has.
    static func fetchFromGameCenter(_ done: @escaping (String) -> Void) {
        guard GKLocalPlayer.local.isAuthenticated else { return }
        GKLocalPlayer.local.fetchSavedGames { games, _ in
            let mine = (games ?? []).filter { $0.name == savedGameName }
            guard !mine.isEmpty else { return }
            var found: [String] = []
            let group = DispatchGroup()
            let lock = NSLock()
            for game in mine {
                group.enter()
                game.loadData { data, _ in
                    if let data, let sealed = String(data: data, encoding: .utf8), let json = unseal(sealed) {
                        lock.lock(); found.append(json); lock.unlock()
                    }
                    group.leave()
                }
            }
            group.notify(queue: .main) {
                guard let best = newest(found.map { Optional($0) }) else { return }
                // Two devices saved at once: keep the newest and settle the conflict with it.
                if mine.count > 1, let data = seal(best).data(using: .utf8) {
                    GKLocalPlayer.local.resolveConflictingSavedGames(mine, with: data, completionHandler: nil)
                }
                done(best)
            }
        }
    }

    // MARK: Saving

    private static var pendingUpload: String?
    private static var uploadScheduled = false

    static func save(_ json: String) {
        guard validated(json) != nil else { return }
        let sealed = seal(json)
        UserDefaults.standard.set(sealed, forKey: key)
        if sealed.utf8.count < 900_000 { cloud.set(sealed, forKey: key) } // iCloud key-value storage holds up to 1 MB
        // Game Center: at most every 20 seconds (and right away when the app goes to the background).
        pendingUpload = sealed
        if !uploadScheduled {
            uploadScheduled = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 20) { uploadToGameCenter() }
        }
    }

    /// Sends the latest save to Game Center now (called when the app goes to the background).
    static func uploadToGameCenter() {
        uploadScheduled = false
        guard let sealed = pendingUpload, GKLocalPlayer.local.isAuthenticated, let data = sealed.data(using: .utf8) else { return }
        pendingUpload = nil
        GKLocalPlayer.local.saveGameData(data, withName: savedGameName) { _, error in
            if error != nil { DispatchQueue.main.async { if pendingUpload == nil { pendingUpload = sealed } } } // try again next time
        }
    }

    // MARK: Sealing

    /// "<signature>.<json>": the signature is an HMAC of the JSON with a key built into the app.
    private static func seal(_ json: String) -> String {
        signature(json) + "." + json
    }

    private static func unseal(_ sealed: String) -> String? {
        guard let dot = sealed.firstIndex(of: ".") else { return nil }
        let sig = String(sealed[..<dot]), json = String(sealed[sealed.index(after: dot)...])
        guard sig.count == 64, constantTimeEqual(sig, signature(json)) else { return nil }
        return validated(json)
    }

    private static func signature(_ json: String) -> String {
        let mac = HMAC<SHA256>.authenticationCode(for: Data(json.utf8), using: sealKey)
        return mac.map { String(format: "%02x", $0) }.joined()
    }

    private static func constantTimeEqual(_ a: String, _ b: String) -> Bool {
        let x = Array(a.utf8), y = Array(b.utf8)
        guard x.count == y.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<x.count { diff |= x[i] ^ y[i] }
        return diff == 0
    }

    /// The sealing key: mixed from scattered constants and the app's bundle ID, never stored as one value.
    private static let sealKey: SymmetricKey = {
        let a: [UInt8] = [0x5c, 0x91, 0x3e, 0xd7, 0x22, 0xa8, 0x6f, 0x14, 0xc3, 0x7b, 0xe0, 0x49, 0x85, 0x1d, 0xb6, 0x2a]
        let b: [UInt8] = [0x0f, 0xd4, 0x67, 0x9a, 0x31, 0xec, 0x58, 0x83, 0x2e, 0xf1, 0x46, 0xbd, 0x70, 0x0b, 0x99, 0xc5]
        var material = Data(zip(a, b).map { ($0 ^ $1) &+ 0x3d })
        material.append(Data((Bundle.main.bundleIdentifier ?? "com.lawnchairgames.cornhole").utf8))
        material.append(contentsOf: b.reversed())
        return SymmetricKey(data: SHA256.hash(data: material))
    }()

    // MARK: Helpers

    private static func newest(_ list: [String?]) -> String? {
        list.compactMap { $0 }.max { savedAt($0) < savedAt($1) }
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
