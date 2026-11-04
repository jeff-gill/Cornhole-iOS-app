import SwiftUI

/// Side-on view of the whole lane: thrower on the left, target board on the right.
struct SideView: View {
    let game: GameModel

    private static let minY = -2.5
    private static let maxY = 33.0
    private static let maxZ = 14.0
    private static let groundStrip = 14.0

    var body: some View {
        let bags = game.world.bags
        let lastID = game.lastThrownBagID
        let preview = game.preview
        let showPreview = game.showsTrajectoryPreview && game.phase != .inFlight
        let thrower = game.currentPlayer
        let throwing = game.phase == .inFlight

        Canvas { ctx, size in
            let sx = size.width / (Self.maxY - Self.minY)
            let groundY = size.height - Self.groundStrip
            let sz = (groundY - 6) / Self.maxZ
            func pt(_ y: Double, _ z: Double) -> CGPoint {
                CGPoint(x: (y - Self.minY) * sx, y: groundY - z * sz)
            }

            // Sky and ground.
            ctx.fill(
                Path(CGRect(origin: .zero, size: size)),
                with: .linearGradient(Gradient(colors: [Theme.skyTop, Theme.skyBottom]), startPoint: .zero, endPoint: CGPoint(x: 0, y: groundY))
            )
            ctx.fill(Path(CGRect(x: 0, y: groundY, width: size.width, height: Self.groundStrip)), with: .color(Theme.grass))
            ctx.fill(Path(CGRect(x: 0, y: groundY, width: size.width, height: 2)), with: .color(Theme.grassDark))

            // Distance ticks every 3 ft.
            for foot in stride(from: 0, through: 27, by: 3) {
                let p = pt(Double(foot), 0)
                ctx.fill(Path(CGRect(x: p.x - 0.5, y: groundY + 3, width: 1, height: 4)), with: .color(.white.opacity(0.5)))
            }

            drawOwnBoard(&ctx, pt: pt)
            drawTargetBoard(&ctx, pt: pt)
            drawThrower(&ctx, pt: pt, player: thrower, throwing: throwing)

            if showPreview, let preview, preview.flight.count > 1 {
                var arc = Path()
                arc.move(to: pt(preview.flight[0].y, preview.flight[0].z))
                for p in preview.flight.dropFirst() { arc.addLine(to: pt(p.y, p.z)) }
                ctx.stroke(arc, with: .color(.white.opacity(0.9)), style: StrokeStyle(lineWidth: 1.5, dash: [4, 4]))
            }

            for bag in bags {
                switch bag.state {
                case .resting, .sliding:
                    drawBagOnSurface(&ctx, pt: pt, bag: bag, surface: { Court.boardPlaneHeight(atY: $0) })
                case .ground:
                    drawBagOnSurface(&ctx, pt: pt, bag: bag, surface: { _ in 0 })
                default:
                    break
                }
            }

            if let lastID, let bag = bags.first(where: { $0.id == lastID }), bag.trail.count > 1 {
                var trail = Path()
                trail.move(to: pt(bag.trail[0].y, bag.trail[0].z))
                for p in bag.trail.dropFirst() { trail.addLine(to: pt(p.y, p.z)) }
                ctx.stroke(trail, with: .color(Theme.player[bag.owner].opacity(0.6)), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [1, 4]))
            }

            for bag in bags where bag.state == .flying {
                let c = pt(bag.position.y, bag.height)
                let s = max(8, Court.bagSize * sx * 1.3)
                var b = ctx
                b.translateBy(x: c.x, y: c.y)
                b.rotate(by: .radians(bag.angle * 1.7))
                b.fill(Path(roundedRect: CGRect(x: -s / 2, y: -s / 4, width: s, height: s / 2), cornerRadius: 2), with: .color(Theme.player[bag.owner]))
                b.stroke(Path(roundedRect: CGRect(x: -s / 2, y: -s / 4, width: s, height: s / 2), cornerRadius: 2), with: .color(Theme.playerDark[bag.owner]), lineWidth: 1)
            }
        }
    }

    private func drawOwnBoard(_ ctx: inout GraphicsContext, pt: (Double, Double) -> CGPoint) {
        // The thrower's board: front at y = 0, raised back at y = -4 (mostly off screen).
        var p = Path()
        p.move(to: pt(0, 0))
        p.addLine(to: pt(0, Court.boardFrontHeight))
        p.addLine(to: pt(-4, Court.boardBackHeight))
        p.addLine(to: pt(-4, 0))
        p.closeSubpath()
        ctx.fill(p, with: .color(Theme.wood.opacity(0.8)))
        ctx.stroke(p, with: .color(Theme.woodDark), lineWidth: 1)
    }

    private func drawTargetBoard(_ ctx: inout GraphicsContext, pt: (Double, Double) -> CGPoint) {
        let front = Court.boardFrontY
        let back = Court.boardBackY
        // Back legs.
        let legTop = pt(back - 0.4, Court.boardBackHeight - 0.05)
        let legBottom = pt(back - 0.15, 0)
        let legs = CGRect(x: legTop.x, y: legTop.y, width: max(2, legBottom.x - legTop.x), height: legBottom.y - legTop.y)
        ctx.fill(Path(legs), with: .color(Theme.woodDark))

        var top = Path()
        top.move(to: pt(front, 0))
        top.addLine(to: pt(front, Court.boardFrontHeight))
        top.addLine(to: pt(back, Court.boardBackHeight))
        top.addLine(to: pt(back, Court.boardBackHeight - 0.25))
        top.addLine(to: pt(front + 0.3, 0.02))
        top.closeSubpath()
        ctx.fill(top, with: .color(Theme.wood))
        ctx.stroke(top, with: .color(Theme.woodDark), lineWidth: 1)

        // The hole, as a gap in the surface.
        let h0 = Court.holeCenter.y - Court.holeRadius
        let h1 = Court.holeCenter.y + Court.holeRadius
        var hole = Path()
        hole.move(to: pt(h0, Court.boardPlaneHeight(atY: h0)))
        hole.addLine(to: pt(h1, Court.boardPlaneHeight(atY: h1)))
        ctx.stroke(hole, with: .color(Theme.hole), lineWidth: 3)
    }

    private func drawThrower(_ ctx: inout GraphicsContext, pt: (Double, Double) -> CGPoint, player: Int, throwing: Bool) {
        let color = Theme.player[player]
        let feet = -0.6
        var body = Path()
        // Legs (stepping forward when throwing).
        body.move(to: pt(feet - 0.8, 0))
        body.addLine(to: pt(feet, 2.9))
        body.addLine(to: pt(feet + (throwing ? 1.2 : 0.6), 0))
        // Torso.
        body.move(to: pt(feet, 2.9))
        body.addLine(to: pt(feet + 0.2, 4.9))
        // Throwing arm: finished high and forward, or cocked back underhand.
        body.move(to: pt(feet + 0.15, 4.6))
        if throwing {
            body.addLine(to: pt(feet + 1.6, 5.4))
        } else {
            body.addLine(to: pt(feet - 0.5, 3.4))
        }
        ctx.stroke(body, with: .color(color), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
        let head = pt(feet + 0.25, 5.5)
        ctx.fill(Path(ellipseIn: CGRect(x: head.x - 5, y: head.y - 5, width: 10, height: 10)), with: .color(color))
    }

    private func drawBagOnSurface(
        _ ctx: inout GraphicsContext,
        pt: (Double, Double) -> CGPoint,
        bag: Bag,
        surface: (Double) -> Double
    ) {
        let half = Court.bagSize / 2
        let y0 = bag.position.y - half
        let y1 = bag.position.y + half
        let thickness = 0.3
        var p = Path()
        p.move(to: pt(y0, surface(y0)))
        p.addLine(to: pt(y1, surface(y1)))
        p.addLine(to: pt(y1, surface(y1) + thickness))
        p.addLine(to: pt(y0, surface(y0) + thickness))
        p.closeSubpath()
        ctx.fill(p, with: .color(bag.state == .ground ? Theme.playerDark[bag.owner] : Theme.player[bag.owner]))
    }
}
