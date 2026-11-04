import QuartzCore
import UIKit

/// Calls `onFrame` with the elapsed time once per screen refresh.
final class DisplayLinkDriver: NSObject {
    var onFrame: ((Double) -> Void)?
    private var link: CADisplayLink?
    private var lastTimestamp: CFTimeInterval = 0

    func start() {
        guard link == nil else { return }
        lastTimestamp = 0
        let link = CADisplayLink(target: self, selector: #selector(frame(_:)))
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    func stop() {
        link?.invalidate()
        link = nil
    }

    @objc private func frame(_ link: CADisplayLink) {
        let now = link.timestamp
        let dt = lastTimestamp == 0 ? 1.0 / 60.0 : min(now - lastTimestamp, 1.0 / 20.0)
        lastTimestamp = now
        onFrame?(dt)
    }
}

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
