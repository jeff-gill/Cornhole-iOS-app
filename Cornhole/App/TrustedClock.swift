import Foundation

/// The game's clock for timers and daily rewards (Prize Can timers, Daily Drops, Bullseye Bags' day, seasons).
///
/// Changing the phone's clock must not skip a wait, so the time comes from the network when it can (the `Date` header
/// of an Apple web server) and is carried forward with the phone's uptime, which the clock setting can't change.
/// Offline, it carries the last trusted time forward the same way; after a restart with no network it only counts the
/// time since the restart, so it can run slow (it catches up the next time it's online) but never fast.
///
/// The game reads it as an offset from the phone's own clock: window.__clockOffset (milliseconds).
enum TrustedClock {
    private static let anchorTimeKey = "clock.anchor.time"     // trusted time (ms since 1970) at the anchor
    private static let anchorUptimeKey = "clock.anchor.uptime" // the phone's uptime (s) at the anchor
    private static let lock = NSLock()

    /// Trusted time now, in milliseconds since 1970.
    static func now() -> Double {
        lock.lock(); defer { lock.unlock() }
        let defaults = UserDefaults.standard
        let up = ProcessInfo.processInfo.systemUptime
        let anchorTime = defaults.double(forKey: anchorTimeKey)
        let anchorUp = defaults.double(forKey: anchorUptimeKey)
        guard anchorTime > 0 else { // first launch, never online yet: start from the phone's clock
            let device = Date().timeIntervalSince1970 * 1000
            setAnchor(device, up)
            return device
        }
        // Same run of the phone (uptime has kept counting): add the time since the anchor. After a restart the uptime
        // starts again from zero, so only the time since the restart is known.
        let elapsed = up >= anchorUp ? up - anchorUp : up
        let time = anchorTime + elapsed * 1000
        setAnchor(time, up)
        return time
    }

    /// Offset to add to the phone's clock to get trusted time (what the game uses).
    static func offset() -> Double { now() - Date().timeIntervalSince1970 * 1000 }

    /// Asks the network for the real time and re-anchors on it, then reports the new offset.
    static func sync(_ done: @escaping (Double) -> Void) {
        guard let url = URL(string: "https://www.apple.com/") else { done(offset()); return }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 6)
        request.httpMethod = "HEAD"
        let sentUp = ProcessInfo.processInfo.systemUptime
        URLSession.shared.dataTask(with: request) { _, response, _ in
            let doneUp = ProcessInfo.processInfo.systemUptime
            if let http = response as? HTTPURLResponse, let header = http.value(forHTTPHeaderField: "Date"), let date = parse(header) {
                // the server's second-precision time, at about the middle of the round trip
                let up = (sentUp + doneUp) / 2
                lock.lock(); setAnchor(date.timeIntervalSince1970 * 1000 + 500, up); lock.unlock()
            }
            let value = offset()
            DispatchQueue.main.async { done(value) }
        }.resume()
    }

    private static func setAnchor(_ time: Double, _ up: Double) {
        UserDefaults.standard.set(time, forKey: anchorTimeKey)
        UserDefaults.standard.set(up, forKey: anchorUptimeKey)
    }

    private static func parse(_ header: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "GMT")
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return formatter.date(from: header)
    }
}
