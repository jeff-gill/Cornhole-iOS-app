import SpriteKit
import UIKit

/// Body position for one frame of the throwing animation.
struct ThrowerPose {
    /// Throwing arm angle from straight down; positive swings forward (down-range).
    var arm: Double = -0.12
    /// 0...1: how far the front foot has stepped forward.
    var step: Double = 0
    /// Forward lean of the torso, radians.
    var lean: Double = 0.04
    /// Small up/down bob of the hips, feet.
    var bob: Double = 0
    var holdingBag = true

    static func current(for game: GameModel) -> ThrowerPose {
        let t = game.clock
        var p = ThrowerPose(arm: -0.12 + 0.05 * sin(t * 2.2), bob: 0.03 * sin(t * 2.2))
        switch game.phase {
        case .metering:
            // Each meter stopped draws the arm further back.
            let stage = Double(meterStage(game.phase))
            p.arm = -0.3 - 0.36 * stage - 0.06 * sin(t * 7)
            p.lean = 0.08 + 0.05 * stage
            p.bob = -0.08 * stage
        case .cpuThinking where game.cpuTimer > 1.2:
            let k = ((game.cpuTimer - 1.2) / 0.8).clamped(0, 1)
            p.arm = -0.12 + (-1.05 + 0.12) * k
            p.lean = 0.04 + 0.12 * k
            p.bob = -0.15 * k
        case .inFlight, .inningOver, .gameOver:
            if game.timeSinceRelease < 1.6 {
                let r = (game.timeSinceRelease / 0.3).clamped(0, 1)
                let e = 1 - pow(1 - r, 3)
                let back = ((game.timeSinceRelease - 0.9) / 0.6).clamped(0, 1)
                p.arm = -1.05 + 3.0 * e - back * 1.4
                p.step = e * (1 - back * 0.3)
                p.lean = 0.3 * e - 0.15 * back
                p.bob = -0.2 * e
                p.holdingBag = false
            }
        default:
            break
        }
        return p
    }

    private static func meterStage(_ phase: GamePhase) -> Int {
        if case .metering(let kind) = phase { return kind.rawValue }
        return 0
    }
}

/// A cartoon cornhole player in a team jersey, built from shape nodes and re-posed every frame.
/// The node's origin sits on the ground between the feet; the player faces +x (down-range).
final class ThrowerNode: SKNode {
    private var parts: [String: SKShapeNode] = [:]
    private let order = [
        "shadow", "backShin", "backSock", "backThigh", "backShoe", "backShoeStripe",
        "farArmUpper", "farArmFore", "farSleeve", "farHand",
        "torso", "torsoStripe",
        "frontShin", "frontSock", "frontThigh", "frontShoe", "frontShoeStripe",
        "neck", "hair", "head", "ear", "eye", "cap", "brim", "capButton",
        "armUpper", "armFore", "sleeve", "hand", "heldBag",
    ]

    override init() {
        super.init()
        for (i, name) in order.enumerated() {
            let n = SKShapeNode()
            n.zPosition = CGFloat(i) * 0.01
            n.isAntialiased = true
            n.lineCap = .round
            n.lineJoin = .round
            parts[name] = n
            addChild(n)
        }
    }

    required init?(coder aDecoder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    private func part(_ name: String) -> SKShapeNode { parts[name]! }

    private func line(_ name: String, _ a: CGPoint, _ b: CGPoint, width: CGFloat, color: UIColor) {
        let p = CGMutablePath()
        p.move(to: a)
        p.addLine(to: b)
        let n = part(name)
        n.path = p
        n.lineWidth = width
        n.strokeColor = color
        n.fillColor = .clear
    }

    private func shape(_ name: String, _ path: CGPath, fill: UIColor, stroke: UIColor = .clear, width: CGFloat = 0) {
        let n = part(name)
        n.path = path
        n.fillColor = fill
        n.strokeColor = stroke
        n.lineWidth = width
    }

    private func circle(_ name: String, _ c: CGPoint, _ r: CGFloat, fill: UIColor) {
        shape(name, CGPath(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r), transform: nil), fill: fill)
    }

    /// Re-poses the player. `u` is points per foot.
    func update(pose: ThrowerPose, unit u: CGFloat, player pl: Int) {
        let P = { (x: Double, y: Double) -> CGPoint in CGPoint(x: CGFloat(x) * u, y: CGFloat(y) * u) }
        let W = { (v: Double) -> CGFloat in CGFloat(v) * u }
        let skin = Palette.skin[pl], skinD = Palette.skinDark[pl]
        let jersey = Palette.player[pl], jerseyD = Palette.playerDark[pl]

        let hip = (x: 0.05 + pose.step * 0.35, y: 3.0 + pose.bob)
        let lean = pose.lean
        func up(_ len: Double, _ extra: Double = 0) -> (x: Double, y: Double) {
            (hip.x + sin(lean + extra) * len, hip.y + cos(lean + extra) * len)
        }
        let shoulder = up(1.9), neck = up(2.15), head = up(2.62)

        // Ground shadow.
        let sc = P(pose.step * 0.4, 0)
        let sw = W(1.2 + pose.step * 0.4)
        shape("shadow", CGPath(ellipseIn: CGRect(x: sc.x - sw, y: sc.y - W(0.18), width: 2 * sw, height: W(0.36)), transform: nil),
              fill: UIColor(white: 0, alpha: 0.22))

        // Legs.
        func leg(_ prefix: String, foot: (x: Double, y: Double), forward: Double, dark: Bool) {
            let knee = ((hip.x + foot.x) / 2 + forward, (hip.y + foot.y) / 2 + 0.05)
            let H = P(hip.x, hip.y), K = P(knee.0, knee.1), F = P(foot.x + 0.12, foot.y + 0.25)
            line(prefix + "Shin", K, F, width: W(0.36), color: dark ? skinD : skin)
            line(prefix + "Sock", CGPoint(x: F.x, y: F.y + W(0.15)), F, width: W(0.38), color: UIColor(hex: 0xF3EFE4))
            line(prefix + "Thigh", H, K, width: W(0.48), color: dark ? Palette.shortsDark : Palette.shorts)
            let s = P(foot.x, foot.y)
            shape(prefix + "Shoe", UIBezierPath(roundedRect: CGRect(x: s.x - W(0.2), y: s.y, width: W(0.78), height: W(0.3)),
                                                cornerRadius: W(0.12)).cgPath,
                  fill: dark ? UIColor(hex: 0xD8D2C4) : UIColor(hex: 0xF6F2E8), stroke: UIColor(hex: 0x3A3A3A), width: max(0.5, W(0.04)))
            shape(prefix + "ShoeStripe", CGPath(rect: CGRect(x: s.x + W(0.05), y: s.y + W(0.15), width: W(0.3), height: W(0.07)), transform: nil),
                  fill: jersey)
        }
        leg("back", foot: (-0.65 - pose.step * 0.15, 0), forward: 0.25, dark: true)

        // Arms.
        func arm(_ names: (upper: String, fore: String, sleeve: String, hand: String), angle: Double, dark: Bool) -> (point: CGPoint, foreAngle: Double) {
            let dir = (sin(angle), -cos(angle))
            let elbow = (shoulder.x + dir.0 * 1.0, shoulder.y + dir.1 * 1.0)
            let fa = angle + 0.25
            let hand = (elbow.0 + sin(fa) * 0.95, elbow.1 - cos(fa) * 0.95)
            let S = P(shoulder.x, shoulder.y), E = P(elbow.0, elbow.1), Hd = P(hand.0, hand.1)
            line(names.upper, S, E, width: W(0.3), color: dark ? skinD : skin)
            line(names.fore, E, Hd, width: W(0.27), color: dark ? skinD : skin)
            line(names.sleeve, S, CGPoint(x: S.x + (E.x - S.x) * 0.45, y: S.y + (E.y - S.y) * 0.45), width: W(0.42), color: dark ? jerseyD : jersey)
            circle(names.hand, Hd, W(0.16), fill: dark ? skinD : skin)
            return (Hd, fa)
        }
        _ = arm(("farArmUpper", "farArmFore", "farSleeve", "farHand"), angle: -pose.arm * 0.5 - 0.15, dark: true)

        // Torso, leaning with the throw.
        func torsoPoint(_ dx: Double, _ dy: Double) -> CGPoint {
            let x = dx * cos(lean) + dy * sin(lean), y = -dx * sin(lean) + dy * cos(lean)
            return P(hip.x + x, hip.y + y)
        }
        let torso = CGMutablePath()
        torso.move(to: torsoPoint(-0.42, 0.05))
        torso.addLine(to: torsoPoint(0.38, 0.05))
        torso.addLine(to: torsoPoint(0.44, 1.95))
        torso.addQuadCurve(to: torsoPoint(-0.46, 1.95), control: torsoPoint(0, 2.12))
        torso.closeSubpath()
        shape("torso", torso, fill: jersey, stroke: jerseyD, width: max(0.5, W(0.05)))
        line("torsoStripe", torsoPoint(-0.05, 0.2), torsoPoint(-0.05, 1.75), width: W(0.07), color: UIColor(white: 1, alpha: 0.85))

        leg("front", foot: (0.45 + pose.step * 1.0, 0), forward: 0.32, dark: false)

        // Neck and head.
        line("neck", P(shoulder.x, shoulder.y), P(neck.0, neck.1), width: W(0.28), color: skinD)
        let hc = P(head.0, head.1), hr = W(0.42)
        circle("hair", CGPoint(x: hc.x - W(0.08), y: hc.y - W(0.02)), hr, fill: Palette.hair[pl])
        circle("head", CGPoint(x: hc.x + W(0.04), y: hc.y - W(0.04)), hr * 0.95, fill: skin)
        circle("ear", CGPoint(x: hc.x - W(0.08), y: hc.y - W(0.08)), W(0.1), fill: skinD)
        circle("eye", CGPoint(x: hc.x + W(0.28), y: hc.y + W(0.02)), max(0.8, W(0.05)), fill: UIColor(white: 0.13, alpha: 1))
        let cap = CGMutablePath()
        cap.addArc(center: CGPoint(x: hc.x, y: hc.y + W(0.05)), radius: hr * 1.02, startAngle: .pi * 0.02, endAngle: .pi * 0.98, clockwise: false)
        cap.closeSubpath()
        shape("cap", cap, fill: jersey)
        shape("brim", UIBezierPath(roundedRect: CGRect(x: hc.x + W(0.1), y: hc.y + W(0.02), width: W(0.55), height: W(0.1)), cornerRadius: W(0.05)).cgPath,
              fill: jerseyD)
        circle("capButton", CGPoint(x: hc.x, y: hc.y + hr * 1.02 + W(0.03)), W(0.05), fill: .white)

        // Throwing arm in front, holding the bag until release.
        let hand = arm(("armUpper", "armFore", "sleeve", "hand"), angle: pose.arm, dark: false)
        let held = part("heldBag")
        held.isHidden = !pose.holdingBag
        if pose.holdingBag {
            let r = CGRect(x: -W(0.3), y: -W(0.12), width: W(0.6), height: W(0.24))
            var t = CGAffineTransform(translationX: hand.point.x, y: hand.point.y - W(0.05)).rotated(by: CGFloat(hand.foreAngle * 0.6))
            let path = CGPath(roundedRect: r, cornerWidth: W(0.08), cornerHeight: W(0.08), transform: &t)
            shape("heldBag", path, fill: Palette.player[pl], stroke: Palette.playerDark[pl], width: max(0.5, W(0.04)))
        }
    }
}
