import Foundation
import UserNotifications

/// Local notification for "your lives are full". The game asks for permission when the player turns alerts on,
/// then reschedules the alert whenever their lives change. An optional "id" (e.g. "can.ready") keeps other alerts separate. Messages: {"op":"permission"}, {"op":"cancel"},
/// {"op":"schedule","at":<ms since 1970>,"title":"…","body":"…"}.
enum LivesAlert {
    private static let livesID = "lives.full"

    static func handle(_ json: String) {
        guard let data = json.data(using: .utf8),
              let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let op = msg["op"] as? String else { return }
        let center = UNUserNotificationCenter.current()
        let id = (msg["id"] as? String).map { String($0.prefix(40)) } ?? livesID
        switch op {
        case "permission":
            center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        case "cancel":
            center.removePendingNotificationRequests(withIdentifiers: [id])
        case "schedule":
            guard let at = (msg["at"] as? NSNumber)?.doubleValue else { return }
            center.removePendingNotificationRequests(withIdentifiers: [id])
            let content = UNMutableNotificationContent()
            content.title = (msg["title"] as? String) ?? "Your lives are full!"
            content.body = (msg["body"] as? String) ?? ""
            content.sound = .default
            let seconds = max(5, at / 1000 - Date().timeIntervalSince1970)
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
            center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
        default:
            break
        }
    }
}
