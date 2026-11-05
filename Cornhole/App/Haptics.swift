import UIKit

/// Taptic feedback for game moments, triggered by the web game through the "haptic" message.
final class Haptics {
    private let lightGenerator = UIImpactFeedbackGenerator(style: .light)
    private let heavyGenerator = UIImpactFeedbackGenerator(style: .heavy)
    private let rigidGenerator = UIImpactFeedbackGenerator(style: .rigid)
    private let notificationGenerator = UINotificationFeedbackGenerator()
    private let selectionGenerator = UISelectionFeedbackGenerator()

    func play(_ kind: String) {
        switch kind {
        case "tap": selectionGenerator.selectionChanged()
        case "release": rigidGenerator.impactOccurred(intensity: 0.6)
        case "thud": heavyGenerator.impactOccurred(intensity: 0.8)
        case "light": lightGenerator.impactOccurred()
        case "success": notificationGenerator.notificationOccurred(.success)
        case "big":
            heavyGenerator.impactOccurred(intensity: 1)
            notificationGenerator.notificationOccurred(.success)
        default: break
        }
    }
}
