import CoreGraphics
import Foundation

/// Maps court feet to scene points for the top-down board view.
/// SpriteKit's y axis points up, which matches down-range (the back of the board is at the top).
struct BoardMap {
    static let minX = -2.2
    static let maxX = 2.2
    // Just a little grass around the board so it fills the view.
    static let minY = Court.boardFrontY - 0.5
    static let maxY = Court.boardBackY + 0.35

    let rect: CGRect

    var scale: CGFloat {
        min(rect.width / CGFloat(Self.maxX - Self.minX), rect.height / CGFloat(Self.maxY - Self.minY))
    }

    var origin: CGPoint {
        CGPoint(
            x: rect.midX - CGFloat(Self.maxX - Self.minX) * scale / 2,
            y: rect.midY - CGFloat(Self.maxY - Self.minY) * scale / 2
        )
    }

    func point(_ p: Vec2) -> CGPoint {
        CGPoint(x: origin.x + CGFloat(p.x - Self.minX) * scale, y: origin.y + CGFloat(p.y - Self.minY) * scale)
    }

    func world(_ q: CGPoint) -> Vec2 {
        Vec2(x: Double((q.x - origin.x) / scale) + Self.minX, y: Double((q.y - origin.y) / scale) + Self.minY)
    }

    func length(_ feet: Double) -> CGFloat { CGFloat(feet) * scale }
}

/// Maps (down-range distance, height) in feet to scene points for the side-on view.
struct SideMap {
    static let minY = -4.0
    static let maxY = 33.0
    static let maxZ = 13.0

    let rect: CGRect

    var groundStrip: CGFloat { 16 }
    var kx: CGFloat { rect.width / CGFloat(Self.maxY - Self.minY) }
    var kz: CGFloat { max(1, (rect.height - groundStrip - 4) / CGFloat(Self.maxZ)) }
    var groundY: CGFloat { rect.minY + groundStrip }

    /// Scene coordinates (y up).
    func point(_ y: Double, _ z: Double) -> CGPoint {
        CGPoint(x: rect.minX + CGFloat(y - Self.minY) * kx, y: groundY + CGFloat(z) * kz)
    }

    /// Coordinates inside an image of `rect.size` (y down), for pre-rendered art.
    func imagePoint(_ y: Double, _ z: Double) -> CGPoint {
        CGPoint(x: CGFloat(y - Self.minY) * kx, y: rect.height - groundStrip - CGFloat(z) * kz)
    }
}

/// Small deterministic random generator so the textures look the same every launch.
struct SeededRandom {
    private var state: UInt64

    init(seed: UInt64) { state = seed }

    mutating func next() -> CGFloat {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        z = z ^ (z >> 31)
        return CGFloat(z >> 11) / CGFloat(1 << 53)
    }
}
