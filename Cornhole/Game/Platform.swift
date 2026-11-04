import UIKit

final class Haptics {
    private let lightGenerator = UIImpactFeedbackGenerator(style: .light)
    private let heavyGenerator = UIImpactFeedbackGenerator(style: .heavy)
    private let rigidGenerator = UIImpactFeedbackGenerator(style: .rigid)
    private let notificationGenerator = UINotificationFeedbackGenerator()
    private let selectionGenerator = UISelectionFeedbackGenerator()

    func tap() { selectionGenerator.selectionChanged() }
    func release() { rigidGenerator.impactOccurred(intensity: 0.6) }
    func thud() { heavyGenerator.impactOccurred(intensity: 0.8) }
    func light() { lightGenerator.impactOccurred() }
    func success() { notificationGenerator.notificationOccurred(.success) }
}
