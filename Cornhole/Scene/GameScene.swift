import SpriteKit
import UIKit

/// The playing field: a side-on view of the lane on top and the top-down board below.
/// It owns the frame loop: every frame it advances the game model and then mirrors it on screen.
final class GameScene: SKScene {
    let game: GameModel

    private let sideLayer = SKNode()
    private let boardLayer = SKNode()
    private let sideCrop = SKCropNode()
    private var sideMap = SideMap(rect: .zero)
    private var boardMap = BoardMap(rect: .zero)
    private var lastUpdate: TimeInterval = 0
    private var layoutSize: CGSize = .zero

    // Side view
    private let sideBackground = SKSpriteNode()
    private let thrower = ThrowerNode()
    private let previewArc = SKShapeNode()
    private let trail = SKShapeNode()
    private var sideBags: [Int: SKSpriteNode] = [:]
    private let flightShadow = SKSpriteNode()

    // Board view
    private let grass = SKSpriteNode()
    private let boardSprite = SKSpriteNode()
    private let zoneShape = SKShapeNode()
    private let zoneCenter = SKShapeNode()
    private let aimLine = SKShapeNode()
    private let slidePreview = SKShapeNode()
    private let slideGhost = SKShapeNode()
    private let pushPreview = SKShapeNode()
    private let pushGhost = SKShapeNode()
    private let zoneLabel = SKLabelNode()
    private let zoneLabel2 = SKLabelNode()
    private let landingMarker = SKShapeNode()
    private let finishMarker = SKNode()
    private var boardBags: [Int: (shadow: SKSpriteNode, bag: SKSpriteNode)] = [:]

    // Textures, rebuilt when the layout changes
    private var bagTextures: [String: SKTexture] = [:]
    private var sideBagTextures: [String: SKTexture] = [:]
    private var shadowTexture = SKTexture()
    private var dotTexture = SKTexture()
    private var confettiTexture = SKTexture()

    private var shownPlanVersion = -1
    private var shownPhase: GamePhase?

    init(game: GameModel) {
        self.game = game
        super.init(size: CGSize(width: 390, height: 560))
        scaleMode = .resizeFill
        backgroundColor = Palette.panel
        anchorPoint = .zero
    }

    required init?(coder aDecoder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func didMove(to view: SKView) {
        view.isMultipleTouchEnabled = false
        if sideLayer.parent == nil { buildNodeTree() }
        layoutIfNeeded(force: true)
    }

    override func didChangeSize(_ oldSize: CGSize) {
        super.didChangeSize(oldSize)
        if sideLayer.parent != nil { layoutIfNeeded(force: false) }
    }

    // MARK: Node tree

    private func buildNodeTree() {
        sideCrop.addChild(sideLayer)
        sideCrop.zPosition = 10
        addChild(sideCrop)
        boardLayer.zPosition = 0
        addChild(boardLayer)

        sideBackground.anchorPoint = .zero
        sideBackground.zPosition = 0
        sideLayer.addChild(sideBackground)
        thrower.zPosition = 5
        sideLayer.addChild(thrower)
        style(previewArc, color: UIColor(white: 1, alpha: 0.95), width: 1.5)
        previewArc.zPosition = 6
        sideLayer.addChild(previewArc)
        trail.fillColor = UIColor(white: 1, alpha: 0.6)
        trail.strokeColor = .clear
        trail.zPosition = 7
        sideLayer.addChild(trail)
        flightShadow.zPosition = 3
        flightShadow.alpha = 0
        sideLayer.addChild(flightShadow)

        grass.anchorPoint = .zero
        grass.zPosition = 0
        boardLayer.addChild(grass)
        boardSprite.anchorPoint = .zero
        boardSprite.zPosition = 1
        boardLayer.addChild(boardSprite)

        zoneShape.fillColor = Palette.gold.withAlphaComponent(0.24)
        zoneShape.strokeColor = Palette.gold.withAlphaComponent(0.85)
        zoneShape.lineWidth = 1.5
        zoneShape.zPosition = 2
        style(zoneCenter, color: UIColor(white: 1, alpha: 0.4), width: 1)
        zoneCenter.zPosition = 2.1
        style(aimLine, color: .white, width: 2.5)
        aimLine.zPosition = 2.2
        style(slidePreview, color: UIColor(white: 1, alpha: 0.9), width: 2)
        slidePreview.zPosition = 3
        style(slideGhost, color: UIColor(white: 1, alpha: 0.75), width: 1.5)
        slideGhost.zPosition = 3
        style(pushPreview, color: Palette.gold.withAlphaComponent(0.95), width: 2.5)
        pushPreview.zPosition = 3.1
        style(pushGhost, color: Palette.gold.withAlphaComponent(0.85), width: 1.5)
        pushGhost.zPosition = 3.1
        for n in [zoneShape, zoneCenter, aimLine, slidePreview, slideGhost, pushPreview, pushGhost] { boardLayer.addChild(n) }

        for l in [zoneLabel, zoneLabel2] {
            l.fontName = "AvenirNextCondensed-DemiBold"
            l.fontSize = 12
            l.fontColor = UIColor(white: 1, alpha: 0.95)
            l.horizontalAlignmentMode = .left
            l.verticalAlignmentMode = .center
            l.zPosition = 4
            boardLayer.addChild(l)
        }
        zoneLabel.text = "flat · slides"
        zoneLabel2.text = "off-centre = spin"

        landingMarker.zPosition = 30
        boardLayer.addChild(landingMarker)
        finishMarker.zPosition = 31
        boardLayer.addChild(finishMarker)
    }

    private func style(_ n: SKShapeNode, color: UIColor, width: CGFloat) {
        n.strokeColor = color
        n.fillColor = .clear
        n.lineWidth = width
        n.lineCap = .round
        n.lineJoin = .round
        n.isAntialiased = true
    }

    // MARK: Layout

    private func layoutIfNeeded(force: Bool) {
        guard size.width > 10, size.height > 10 else { return }
        if !force && size == layoutSize { return }
        layoutSize = size

        let sideHeight = (size.height * 0.36).rounded()
        sideMap = SideMap(rect: CGRect(x: 0, y: size.height - sideHeight, width: size.width, height: sideHeight))
        boardMap = BoardMap(rect: CGRect(x: 0, y: 0, width: size.width, height: size.height - sideHeight))

        // Side view art.
        let crop = SKSpriteNode(color: .white, size: sideMap.rect.size)
        crop.anchorPoint = .zero
        crop.position = sideMap.rect.origin
        sideCrop.maskNode = crop
        sideBackground.texture = SKTexture(image: Art.sideScene(map: sideMap))
        sideBackground.size = sideMap.rect.size
        sideBackground.position = sideMap.rect.origin

        // Board view art.
        grass.texture = SKTexture(image: Art.grass(size: boardMap.rect.size, footScale: boardMap.scale))
        grass.size = boardMap.rect.size
        grass.position = boardMap.rect.origin
        let board = Art.boardTop(footScale: boardMap.scale)
        boardSprite.texture = SKTexture(image: board.image)
        boardSprite.size = board.image.size
        let corner = boardMap.point(Vec2(x: -Court.boardHalfWidth, y: Court.boardFrontY))
        boardSprite.position = CGPoint(x: corner.x - board.padding, y: corner.y - board.padding)

        // Bag textures at the new size.
        bagTextures = [:]
        sideBagTextures = [:]
        let bagPoints = boardMap.length(Court.bagSize)
        let sideBagSize = CGSize(width: max(12, CGFloat(Court.bagSize) * sideMap.kx * 1.5), height: max(4, 0.2 * sideMap.kz * 1.6))
        for owner in 0..<2 {
            for dim in [false, true] {
                let key = "\(owner)\(dim)"
                bagTextures[key] = SKTexture(image: Art.bagTop(owner: owner, dim: dim, size: bagPoints))
                sideBagTextures[key] = SKTexture(image: Art.bagSide(owner: owner, dim: dim, size: sideBagSize))
            }
        }
        shadowTexture = SKTexture(image: Art.softShadow(size: CGSize(width: 64, height: 64)))
        dotTexture = SKTexture(image: Art.dot(diameter: 8))
        confettiTexture = SKTexture(image: Art.confettiPiece())
        flightShadow.texture = shadowTexture
        flightShadow.size = CGSize(width: 14, height: 4)

        for (_, n) in boardBags { n.shadow.removeFromParent(); n.bag.removeFromParent() }
        boardBags = [:]
        for (_, n) in sideBags { n.removeFromParent() }
        sideBags = [:]
        rebuildMarkers()
        shownPlanVersion = -1
    }

    private func rebuildMarkers() {
        let r = boardMap.length(0.24)
        let ring = CGMutablePath()
        ring.addEllipse(in: CGRect(x: -r, y: -r, width: 2 * r, height: 2 * r))
        for (a, b) in [(CGPoint(x: -1.5 * r, y: 0), CGPoint(x: -0.5 * r, y: 0)), (CGPoint(x: 0.5 * r, y: 0), CGPoint(x: 1.5 * r, y: 0)),
                       (CGPoint(x: 0, y: -1.5 * r), CGPoint(x: 0, y: -0.5 * r)), (CGPoint(x: 0, y: 0.5 * r), CGPoint(x: 0, y: 1.5 * r))] {
            ring.move(to: a)
            ring.addLine(to: b)
        }
        landingMarker.removeAllChildren()
        landingMarker.path = ring
        landingMarker.strokeColor = Palette.gold
        landingMarker.lineWidth = 2.5
        landingMarker.fillColor = .clear
        let back = SKShapeNode(path: ring)
        back.strokeColor = UIColor(white: 0, alpha: 0.45)
        back.lineWidth = 4.5
        back.zPosition = -0.1
        landingMarker.addChild(back)

        finishMarker.removeAllChildren()
        let fr = boardMap.length(0.16) + 3
        let outline = SKShapeNode(circleOfRadius: fr)
        outline.strokeColor = UIColor(white: 0, alpha: 0.45)
        outline.lineWidth = 4.5
        outline.fillColor = .clear
        let green = SKShapeNode(circleOfRadius: fr)
        green.strokeColor = Palette.go
        green.lineWidth = 2.5
        green.fillColor = .clear
        let dot = SKShapeNode(circleOfRadius: fr * 0.35)
        dot.fillColor = Palette.go
        dot.strokeColor = .clear
        for n in [outline, green, dot] { finishMarker.addChild(n) }
    }

    // MARK: Frame loop

    override func update(_ currentTime: TimeInterval) {
        let dt = lastUpdate == 0 ? 1.0 / 60.0 : min(currentTime - lastUpdate, 1.0 / 20.0)
        lastUpdate = currentTime
        layoutIfNeeded(force: false)
        guard layoutSize != .zero else { return }

        game.tick(dt)
        for effect in game.drainEffects() { play(effect) }

        if game.planVersion != shownPlanVersion || game.phase != shownPhase {
            shownPlanVersion = game.planVersion
            shownPhase = game.phase
            rebuildGuides()
        }
        updateMarkers()
        updateBoardBags()
        updateSide()
    }

    // MARK: Board guides

    private func rebuildGuides() {
        let plan = game.plan
        let showGuides = plan != nil && game.phase != .inFlight
        let editing = game.canEditMarkers
        let showPreview = showGuides && game.showsTrajectoryPreview

        for n in [zoneShape, zoneCenter, aimLine, slidePreview, slideGhost, pushPreview, pushGhost] { n.path = nil }
        zoneLabel.isHidden = true
        zoneLabel2.isHidden = true
        previewArc.path = nil
        guard let plan, showGuides else { return }

        // The throw's path coming in from the thrower's hand.
        let d = Vec2(x: sin(plan.ideal.azimuth), y: cos(plan.ideal.azimuth))
        let aim = CGMutablePath()
        aim.move(to: boardMap.point(plan.landing - d * 8))
        aim.addLine(to: boardMap.point(plan.landing))
        aimLine.path = aim.copy(dashingWithPhase: 0, lengths: [0.1, 6])
        aimLine.strokeColor = Palette.player[game.currentPlayer].withAlphaComponent(0.9)

        // Landing zone fan.
        let z = plan.zone
        if editing && z.maxDistance - z.minDistance > 0.02 {
            var left: [CGPoint] = [], right: [CGPoint] = []
            for i in 0...16 {
                let dist = z.minDistance + (z.maxDistance - z.minDistance) * Double(i) / 16
                let a = AimZone.maxAngle(forDistance: dist)
                left.append(boardMap.point(z.landing(finish: plan.finish, distance: dist, angle: -a)))
                right.append(boardMap.point(z.landing(finish: plan.finish, distance: dist, angle: a)))
            }
            let fan = CGMutablePath()
            fan.addLines(between: left + right.reversed())
            fan.closeSubpath()
            zoneShape.path = fan
            let center = CGMutablePath()
            center.move(to: boardMap.point(z.landing(finish: plan.finish, distance: z.minDistance, angle: 0)))
            center.addLine(to: boardMap.point(z.landing(finish: plan.finish, distance: z.maxDistance, angle: 0)))
            zoneCenter.path = center.copy(dashingWithPhase: 0, lengths: [3, 4])
            let ea = boardMap.point(z.landing(finish: plan.finish, distance: z.maxDistance, angle: AimZone.maxAngle(forDistance: z.maxDistance)))
            let eb = boardMap.point(z.landing(finish: plan.finish, distance: z.maxDistance, angle: -AimZone.maxAngle(forDistance: z.maxDistance)))
            let edge = ea.x > eb.x ? ea : eb
            zoneLabel.position = CGPoint(x: edge.x + 22, y: edge.y + 9)
            zoneLabel2.position = CGPoint(x: edge.x + 22, y: edge.y - 5)
            zoneLabel.isHidden = false
            zoneLabel2.isHidden = false
        }

        guard showPreview else { return }
        let pv = plan.preview
        if pv.slide.count > 1 {
            let path = CGMutablePath()
            path.addLines(between: pv.slide.map { boardMap.point($0) })
            slidePreview.path = path.copy(dashingWithPhase: 0, lengths: [5, 5])
            if pv.outcome != .inHole {
                slideGhost.path = ghostSquare(at: pv.finalPosition)
            }
        }
        if pv.pushPath.count > 1 {
            let path = CGMutablePath()
            path.addLines(between: pv.pushPath.map { boardMap.point($0) })
            pushPreview.path = path.copy(dashingWithPhase: 0, lengths: [2, 4])
            if let end = pv.pushEnd, pv.pushOutcome != .inHole {
                pushGhost.path = ghostSquare(at: end)
            }
        }
        if pv.flight.count > 1 {
            let arc = CGMutablePath()
            arc.addLines(between: pv.flight.map { sideMap.point($0.y, $0.z) })
            previewArc.path = arc.copy(dashingWithPhase: 0, lengths: [4, 4])
        }
    }

    private func ghostSquare(at p: Vec2) -> CGPath {
        let c = boardMap.point(p), z = boardMap.length(Court.bagSize)
        let r = CGRect(x: c.x - z / 2, y: c.y - z / 2, width: z, height: z)
        return CGPath(roundedRect: r, cornerWidth: z * 0.25, cornerHeight: z * 0.25, transform: nil).copy(dashingWithPhase: 0, lengths: [3, 3])
    }

    private func updateMarkers() {
        let visible = game.phase != .inFlight
        if let landing = game.landingTarget, visible {
            landingMarker.isHidden = false
            landingMarker.position = boardMap.point(landing)
        } else {
            landingMarker.isHidden = true
        }
        if let finish = game.finish, visible {
            finishMarker.isHidden = false
            finishMarker.position = boardMap.point(finish)
            finishMarker.setScale(1 + 0.08 * CGFloat(sin(game.clock * 4)))
        } else {
            finishMarker.isHidden = true
        }
    }

    // MARK: Bags

    private func updateBoardBags() {
        let bags = game.world.bags
        let ids = Set(bags.map(\.id))
        for (id, n) in boardBags where !ids.contains(id) {
            n.shadow.removeFromParent()
            n.bag.removeFromParent()
            boardBags[id] = nil
        }
        let z = boardMap.length(Court.bagSize)
        for b in bags {
            let nodes: (shadow: SKSpriteNode, bag: SKSpriteNode)
            if let existing = boardBags[b.id] {
                nodes = existing
            } else {
                let shadow = SKSpriteNode(texture: shadowTexture)
                let bag = SKSpriteNode(texture: bagTextures["\(b.owner)false"])
                boardLayer.addChild(shadow)
                boardLayer.addChild(bag)
                nodes = (shadow, bag)
                boardBags[b.id] = nodes
            }
            let shadow = nodes.shadow, sprite = nodes.bag
            switch b.state {
            case .inHole:
                shadow.isHidden = true
                sprite.isHidden = true
            case .ground, .sliding, .resting:
                let dim = b.state == .ground
                sprite.isHidden = false
                shadow.isHidden = false
                sprite.texture = bagTextures["\(b.owner)\(dim)"]
                sprite.size = CGSize(width: z * 1.2, height: z * 1.2)
                sprite.position = boardMap.point(b.position)
                sprite.zRotation = CGFloat(-b.angle)
                sprite.zPosition = dim ? 10 : 20
                shadow.size = CGSize(width: z * 1.25, height: z * 1.15)
                shadow.position = CGPoint(x: sprite.position.x + z * 0.08, y: sprite.position.y - z * 0.12)
                shadow.alpha = 0.75
                shadow.zPosition = sprite.zPosition - 0.5
            case .flying:
                let above = max(0, b.height - Court.surfaceHeight(at: b.position))
                let lift = CGFloat(min(1.2, above * 0.09))
                sprite.isHidden = false
                shadow.isHidden = false
                sprite.texture = bagTextures["\(b.owner)false"]
                sprite.size = CGSize(width: z * 1.2 * (1 + lift), height: z * 1.2 * (1 + lift))
                sprite.position = boardMap.point(Vec2(x: b.position.x, y: b.position.y + above * 0.08))
                sprite.zRotation = CGFloat(-b.angle)
                sprite.zPosition = 40
                let ground = boardMap.point(b.position)
                let shrink = CGFloat(1 - min(0.45, above * 0.035))
                shadow.size = CGSize(width: z * 1.1 * shrink, height: z * shrink)
                shadow.position = CGPoint(x: ground.x + CGFloat(above) * 0.6, y: ground.y - CGFloat(above) * 0.9)
                shadow.alpha = CGFloat(max(0.25, 0.8 - above * 0.04))
                shadow.zPosition = 39
            }
        }
    }

    // MARK: Side view

    private func updateSide() {
        thrower.position = sideMap.point(-1.2, 0)
        thrower.update(pose: ThrowerPose.current(for: game), unit: sideMap.kz, player: game.currentPlayer)

        let bags = game.world.bags
        let ids = Set(bags.map(\.id))
        for (id, n) in sideBags where !ids.contains(id) {
            n.removeFromParent()
            sideBags[id] = nil
        }
        let slope = atan2(CGFloat(Court.boardBackHeight - Court.boardFrontHeight) * sideMap.kz,
                          CGFloat(Court.boardBackY - Court.boardFrontY) * sideMap.kx)
        flightShadow.alpha = 0
        for b in bags {
            let sprite: SKSpriteNode
            if let existing = sideBags[b.id] {
                sprite = existing
            } else {
                sprite = SKSpriteNode(texture: sideBagTextures["\(b.owner)false"])
                sprite.zPosition = 8
                sideLayer.addChild(sprite)
                sideBags[b.id] = sprite
            }
            let base = sideBagTextures["\(b.owner)false"]?.size() ?? CGSize(width: 12, height: 4)
            switch b.state {
            case .inHole:
                sprite.isHidden = true
            case .resting, .sliding:
                sprite.isHidden = false
                sprite.texture = sideBagTextures["\(b.owner)false"]
                sprite.size = base
                sprite.xScale = 1
                let p = sideMap.point(b.position.y, Court.boardPlaneHeight(atY: b.position.y))
                sprite.position = CGPoint(x: p.x, y: p.y + base.height * 0.45)
                sprite.zRotation = slope
            case .ground:
                sprite.isHidden = false
                sprite.texture = sideBagTextures["\(b.owner)true"]
                sprite.size = base
                sprite.xScale = 1
                let p = sideMap.point(b.position.y, 0)
                sprite.position = CGPoint(x: p.x, y: p.y + base.height * 0.45)
                sprite.zRotation = 0
            case .flying:
                sprite.isHidden = false
                sprite.texture = sideBagTextures["\(b.owner)false"]
                sprite.size = CGSize(width: base.width * 1.15, height: base.height * 1.15)
                sprite.xScale = 0.78 + 0.22 * CGFloat(abs(cos(b.angle)))
                sprite.position = sideMap.point(b.position.y, b.height)
                if let t = b.throwParams {
                    let v = t.velocity(at: b.flightTime)
                    let pitch = atan2(CGFloat(v.z) * sideMap.kz, CGFloat(v.y) * sideMap.kx) * 0.6
                    sprite.zRotation = pitch + 0.12 * CGFloat(sin(b.angle * 2))
                }
                let above = b.height - Court.surfaceHeight(at: b.position)
                flightShadow.position = sideMap.point(b.position.y, Court.surfaceHeight(at: b.position))
                flightShadow.alpha = CGFloat(max(0.1, 0.6 - above * 0.04))
            }
        }

        // Fading trail behind the last throw.
        if let last = game.lastThrownBagID, let b = game.world.bag(id: last), b.trail.count > 1 {
            let path = CGMutablePath()
            var i = 0
            while i < b.trail.count {
                let p = sideMap.point(b.trail[i].y, b.trail[i].z)
                let r: CGFloat = 0.6 + 0.9 * CGFloat(i) / CGFloat(b.trail.count)
                path.addEllipse(in: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r))
                i += 2
            }
            trail.path = path
        } else {
            trail.path = nil
        }
    }

    // MARK: Effects

    private func play(_ effect: GameEffect) {
        switch effect {
        case .landed(let p):
            dust(at: p, color: UIColor(red: 0.92, green: 0.84, blue: 0.67, alpha: 1))
            ring(at: p)
        case .landedOnGrass(let p):
            dust(at: p, color: UIColor(red: 0.43, green: 0.33, blue: 0.2, alpha: 1))
        case .cornhole(let player):
            confetti(player: player)
            shake()
        }
    }

    private func dust(at p: Vec2, color: UIColor) {
        let ft = boardMap.scale
        let e = SKEmitterNode()
        e.particleTexture = dotTexture
        e.numParticlesToEmit = 14
        e.particleBirthRate = 600
        e.particleLifetime = 0.6
        e.particleLifetimeRange = 0.3
        e.emissionAngleRange = .pi * 2
        e.particleSpeed = 1.0 * ft
        e.particleSpeedRange = 0.8 * ft
        e.particleAlpha = 0.7
        e.particleAlphaSpeed = -1.1
        e.particleScale = 0.1 * ft / 8
        e.particleScaleRange = 0.05 * ft / 8
        e.particleScaleSpeed = 0.1
        e.particleColor = color
        e.particleColorBlendFactor = 1
        e.position = boardMap.point(p)
        e.zPosition = 35
        boardLayer.addChild(e)
        e.run(.sequence([.wait(forDuration: 1.3), .removeFromParent()]))
    }

    private func ring(at p: Vec2) {
        let r = boardMap.length(0.2)
        let n = SKShapeNode(circleOfRadius: r)
        n.strokeColor = UIColor(white: 1, alpha: 0.6)
        n.lineWidth = 2
        n.fillColor = .clear
        n.position = boardMap.point(p)
        n.zPosition = 34
        boardLayer.addChild(n)
        n.run(.sequence([.group([.scale(to: 3.2, duration: 0.4), .fadeOut(withDuration: 0.4)]), .removeFromParent()]))
    }

    private func confetti(player: Int) {
        let ft = boardMap.scale
        let hole = boardMap.point(Court.holeCenter)
        for color in [Palette.player[player], Palette.gold, UIColor.white, Palette.playerLight[player]] {
            let e = SKEmitterNode()
            e.particleTexture = confettiTexture
            e.numParticlesToEmit = 16
            e.particleBirthRate = 400
            e.particleLifetime = 1.3
            e.particleLifetimeRange = 0.5
            e.emissionAngleRange = .pi * 2
            e.particleSpeed = 2.2 * ft
            e.particleSpeedRange = 1.6 * ft
            e.particleRotationRange = .pi * 2
            e.particleRotationSpeed = 6
            e.particleAlpha = 1
            e.particleAlphaSpeed = -0.7
            e.particleScale = 0.12 * ft / 8
            e.particleScaleRange = 0.05 * ft / 8
            e.particleColor = color
            e.particleColorBlendFactor = 1
            e.position = hole
            e.zPosition = 45
            boardLayer.addChild(e)
            e.run(.sequence([.wait(forDuration: 2.2), .removeFromParent()]))
        }
        let glow = SKShapeNode(circleOfRadius: boardMap.length(0.35))
        glow.fillColor = Palette.gold
        glow.strokeColor = .clear
        glow.blendMode = .add
        glow.alpha = 0.6
        glow.position = hole
        glow.zPosition = 44
        boardLayer.addChild(glow)
        glow.run(.sequence([.group([.scale(to: 3, duration: 0.9), .fadeOut(withDuration: 0.9)]), .removeFromParent()]))
    }

    private func shake() {
        var moves: [SKAction] = []
        for i in 0..<8 {
            let m = CGFloat(8 - i) * 0.9
            moves.append(.move(to: CGPoint(x: CGFloat.random(in: -m...m), y: CGFloat.random(in: -m...m)), duration: 0.035))
        }
        moves.append(.move(to: .zero, duration: 0.04))
        boardLayer.removeAction(forKey: "shake")
        boardLayer.run(.sequence(moves), withKey: "shake")
    }

    // MARK: Touches

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let t = touches.first else { return }
        let p = t.location(in: self)
        guard boardMap.rect.contains(p) else { return }
        game.beginDrag(at: boardMap.world(p))
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let t = touches.first else { return }
        game.drag(to: boardMap.world(t.location(in: self)))
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        game.endDrag()
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        game.endDrag()
    }
}
