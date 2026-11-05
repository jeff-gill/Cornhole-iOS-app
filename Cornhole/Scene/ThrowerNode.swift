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

/// A cartoon cornhole player in a team jersey. Every body part is a pre-painted sprite that is
/// only moved and rotated each frame, which keeps it cheap to animate.
/// The node's origin sits on the ground between the feet; the player faces +x (down-range).
final class ThrowerNode: SKNode {
    private static let limbTexture = SKTexture(image: Art.limb())
    private static let discTexture = SKTexture(image: Art.disc())

    private var sprites: [String: SKSpriteNode] = [:]
    private var configuredPlayer = -1
    private let shadow = SKSpriteNode()

    /// Back-to-front drawing order.
    private let order = [
        "backThigh", "backShin", "backKnee", "backSock", "backShoe",
        "farUpper", "farFore", "farElbow", "farSleeve", "farHand",
        "hips", "torso",
        "frontThigh", "frontShin", "frontKnee", "frontSock", "frontShoe",
        "neck", "head",
        "upper", "fore", "elbow", "sleeve", "hand", "heldBag",
    ]

    override init() {
        super.init()
        shadow.zPosition = -1
        addChild(shadow)
        for (i, name) in order.enumerated() {
            let s = SKSpriteNode()
            s.zPosition = CGFloat(i) * 0.01
            s.colorBlendFactor = 1
            sprites[name] = s
            addChild(s)
        }
    }

    required init?(coder aDecoder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    private func sprite(_ name: String) -> SKSpriteNode { sprites[name]! }

    private func configure(player pl: Int, shadowTexture: SKTexture, bagTexture: SKTexture?) {
        configuredPlayer = pl
        shadow.texture = shadowTexture
        for name in order {
            let s = sprite(name)
            s.texture = Self.limbTexture
            s.color = .white
            s.colorBlendFactor = 1
            s.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        }
        for name in ["backKnee", "frontKnee", "farElbow", "elbow", "farHand", "hand", "hips"] {
            sprite(name).texture = Self.discTexture
        }
        let skin = Palette.skin[pl], skinD = Palette.skinDark[pl]
        for name in ["frontShin", "frontKnee", "upper", "fore", "elbow", "hand"] { sprite(name).color = skin }
        for name in ["backShin", "backKnee", "farUpper", "farFore", "farElbow", "farHand", "neck"] { sprite(name).color = skinD }
        for name in ["frontThigh", "hips"] { sprite(name).color = Palette.shorts }
        sprite("backThigh").color = Palette.shortsDark
        for name in ["frontSock", "backSock"] { sprite(name).color = UIColor(hex: 0xF3EFE4) }
        sprite("sleeve").color = Palette.player[pl]
        sprite("farSleeve").color = Palette.playerDark[pl]

        let torso = Art.torso(player: pl)
        sprite("torso").texture = SKTexture(image: torso.0)
        sprite("torso").anchorPoint = torso.1
        sprite("torso").colorBlendFactor = 0
        sprite("head").texture = SKTexture(image: Art.head(player: pl))
        sprite("head").anchorPoint = CGPoint(x: 0.7 / 1.5, y: 1 - 0.8 / 1.5)
        sprite("head").colorBlendFactor = 0
        let shoe = Art.shoe(player: pl)
        for name in ["frontShoe", "backShoe"] {
            sprite(name).texture = SKTexture(image: shoe.0)
            sprite(name).anchorPoint = shoe.1
            sprite(name).colorBlendFactor = 0
        }
        sprite("backShoe").color = UIColor(white: 0.85, alpha: 1)
        sprite("backShoe").colorBlendFactor = 0.25
        sprite("heldBag").texture = bagTexture
        sprite("heldBag").colorBlendFactor = 0
    }

    /// A limb from a to b.
    private func limb(_ name: String, _ a: CGPoint, _ b: CGPoint, width: CGFloat) {
        let s = sprite(name)
        let dx = b.x - a.x, dy = b.y - a.y
        s.position = CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
        s.size = CGSize(width: max(1, hypot(dx, dy) + width * 0.3), height: width)
        s.zRotation = atan2(dy, dx)
    }

    private func dot(_ name: String, _ p: CGPoint, diameter: CGFloat) {
        let s = sprite(name)
        s.position = p
        s.size = CGSize(width: diameter, height: diameter)
        s.zRotation = 0
    }

    /// Re-poses the player. `u` is points per foot.
    func update(pose: ThrowerPose, unit u: CGFloat, player pl: Int, shadowTexture: SKTexture, bagTexture: SKTexture?) {
        if pl != configuredPlayer { configure(player: pl, shadowTexture: shadowTexture, bagTexture: bagTexture) }
        sprite("heldBag").texture = bagTexture

        func P(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: CGFloat(x) * u, y: CGFloat(y) * u) }
        func W(_ v: Double) -> CGFloat { CGFloat(v) * u }

        let hip = (x: 0.05 + pose.step * 0.35, y: 3.0 + pose.bob)
        let lean = pose.lean
        func up(_ len: Double) -> (x: Double, y: Double) { (hip.x + sin(lean) * len, hip.y + cos(lean) * len) }
        let shoulder = up(1.9), neck = up(2.15), head = up(2.62)

        shadow.position = P(pose.step * 0.4, 0)
        shadow.size = CGSize(width: W(2.6 + pose.step * 0.8), height: W(0.4))
        shadow.alpha = 0.55

        func leg(_ side: String, foot: (x: Double, y: Double), forward: Double) {
            let knee = ((hip.x + foot.x) / 2 + forward, (hip.y + foot.y) / 2 + 0.05)
            let H = P(hip.x, hip.y), K = P(knee.0, knee.1), F = P(foot.x + 0.12, foot.y + 0.3)
            limb(side + "Thigh", H, K, width: W(0.5))
            limb(side + "Shin", K, F, width: W(0.36))
            dot(side + "Knee", K, diameter: W(0.4))
            limb(side + "Sock", CGPoint(x: F.x, y: F.y + W(0.12)), F, width: W(0.38))
            let shoe = sprite(side + "Shoe")
            shoe.position = P(foot.x, foot.y)
            shoe.size = CGSize(width: W(0.9), height: W(0.4))
        }
        leg("back", foot: (-0.65 - pose.step * 0.15, 0), forward: 0.25)
        leg("front", foot: (0.45 + pose.step * 1.0, 0), forward: 0.32)
        dot("hips", P(hip.x, hip.y + 0.1), diameter: W(0.85))

        func arm(_ prefix: String, angle: Double) -> (point: CGPoint, foreAngle: Double) {
            let elbow = (shoulder.x + sin(angle) * 1.0, shoulder.y - cos(angle) * 1.0)
            let fa = angle + 0.25
            let hand = (elbow.0 + sin(fa) * 0.95, elbow.1 - cos(fa) * 0.95)
            let S = P(shoulder.x, shoulder.y), E = P(elbow.0, elbow.1), Hd = P(hand.0, hand.1)
            let n = { (part: String) -> String in
                prefix.isEmpty ? part : prefix + part.prefix(1).uppercased() + String(part.dropFirst())
            }
            limb(n("upper"), S, E, width: W(0.3))
            limb(n("fore"), E, Hd, width: W(0.27))
            dot(n("elbow"), E, diameter: W(0.3))
            limb(n("sleeve"), S, CGPoint(x: S.x + (E.x - S.x) * 0.45, y: S.y + (E.y - S.y) * 0.45), width: W(0.44))
            dot(n("hand"), Hd, diameter: W(0.34))
            return (Hd, fa)
        }
        _ = arm("far", angle: -pose.arm * 0.5 - 0.15)

        let torso = sprite("torso")
        torso.position = P(hip.x, hip.y)
        torso.size = CGSize(width: W(1.1), height: W(2.35))
        torso.zRotation = CGFloat(-lean)

        limb("neck", P(shoulder.x, shoulder.y), P(neck.0, neck.1), width: W(0.28))
        let headSprite = sprite("head")
        headSprite.position = P(head.0, head.1)
        headSprite.size = CGSize(width: W(1.5), height: W(1.5))
        headSprite.zRotation = CGFloat(-lean * 0.5)

        let hand = arm("", angle: pose.arm)
        let held = sprite("heldBag")
        held.isHidden = !pose.holdingBag || bagTexture == nil
        held.position = CGPoint(x: hand.point.x, y: hand.point.y - W(0.08))
        held.size = CGSize(width: W(0.62), height: W(0.26))
        held.zRotation = CGFloat(hand.foreAngle * 0.6)
    }
}
