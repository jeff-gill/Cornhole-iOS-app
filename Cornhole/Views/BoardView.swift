import SwiftUI

/// Maps between court feet and screen points for the top-down board view.
/// Down-range (toward the back of the board) is up the screen.
struct BoardMapping {
    static let minX = -2.2
    static let maxX = 2.2
    static let minY = Court.boardFrontY - 1.1
    static let maxY = Court.boardBackY + 0.9

    let size: CGSize

    var scale: Double {
        min(size.width / (Self.maxX - Self.minX), size.height / (Self.maxY - Self.minY))
    }

    private var offset: CGPoint {
        CGPoint(
            x: (size.width - (Self.maxX - Self.minX) * scale) / 2,
            y: (size.height - (Self.maxY - Self.minY) * scale) / 2
        )
    }

    func point(_ p: Vec2) -> CGPoint {
        CGPoint(x: offset.x + (p.x - Self.minX) * scale, y: offset.y + (Self.maxY - p.y) * scale)
    }

    func world(_ s: CGPoint) -> Vec2 {
        Vec2(x: (s.x - offset.x) / scale + Self.minX, y: Self.maxY - (s.y - offset.y) / scale)
    }

    func length(_ feet: Double) -> CGFloat { feet * scale }

    func rect(minX: Double, minY: Double, maxX: Double, maxY: Double) -> CGRect {
        let a = point(Vec2(x: minX, y: maxY))
        let b = point(Vec2(x: maxX, y: minY))
        return CGRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y)
    }
}

struct BoardView: View {
    let game: GameModel
    @State private var dragging: MarkerKind?

    var body: some View {
        // Read observable state here so SwiftUI tracks it, then hand plain values to the Canvas.
        let bags = game.world.bags
        let landing = game.landingTarget
        let end = game.endTarget
        let ideal = game.idealThrow
        let preview = game.preview
        let showPreview = game.showsTrajectoryPreview
        let thrower = game.currentPlayer
        let editable = game.canEditMarkers

        GeometryReader { geo in
            let map = BoardMapping(size: geo.size)
            Canvas { ctx, size in
                drawCourt(&ctx, size: size, map: map)
                if let ideal, let landing {
                    drawAimLine(&ctx, map: map, ideal: ideal, landing: landing, player: thrower)
                }
                if showPreview, let preview {
                    drawPreview(&ctx, map: map, preview: preview)
                }
                for bag in bags where bag.state == .ground { drawBag(&ctx, map: map, bag: bag) }
                for bag in bags where bag.isOnBoardSurface { drawBag(&ctx, map: map, bag: bag) }
                if let landing { drawLandingMarker(&ctx, map: map, at: landing) }
                if let end { drawEndMarker(&ctx, map: map, at: end) }
                for bag in bags where bag.state == .flying { drawFlyingBag(&ctx, map: map, bag: bag) }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        guard editable else { return }
                        handleDrag(at: map.world(value.location))
                    }
                    .onEnded { _ in dragging = nil }
            )
            .overlay(alignment: .bottomLeading) {
                if editable && landing == nil {
                    hint("Tap where the bag should land")
                } else if editable && end == nil {
                    hint("Tap where it should finish")
                }
            }
        }
        .clipped()
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.black.opacity(0.45), in: Capsule())
            .foregroundStyle(.white)
            .padding(10)
            .allowsHitTesting(false)
    }

    private func handleDrag(at p: Vec2) {
        if dragging == nil {
            if let landing = game.landingTarget {
                if let end = game.endTarget {
                    dragging = p.distance(to: landing) <= p.distance(to: end) ? .landing : .end
                } else {
                    dragging = p.distance(to: landing) < 0.4 ? .landing : .end
                }
            } else {
                dragging = .landing
            }
        }
        if let dragging { game.setMarker(dragging, at: p) }
    }

    // MARK: Drawing

    private func drawCourt(_ ctx: inout GraphicsContext, size: CGSize, map: BoardMapping) {
        ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Theme.grass))
        // Mowing stripes.
        let stripe = map.length(0.8)
        if stripe > 1 {
            var y = 0.0
            var dark = false
            while y < size.height {
                if dark {
                    ctx.fill(Path(CGRect(x: 0, y: y, width: size.width, height: stripe)), with: .color(Theme.grassDark.opacity(0.35)))
                }
                dark.toggle()
                y += stripe
            }
        }

        let board = map.rect(minX: -Court.boardHalfWidth, minY: Court.boardFrontY, maxX: Court.boardHalfWidth, maxY: Court.boardBackY)
        // Drop shadow: the back of the board is raised.
        ctx.fill(Path(roundedRect: board.offsetBy(dx: map.length(0.12), dy: -map.length(0.05)), cornerRadius: 3), with: .color(.black.opacity(0.25)))
        ctx.fill(
            Path(roundedRect: board, cornerRadius: 3),
            with: .linearGradient(
                Gradient(colors: [Theme.wood, Theme.wood.opacity(0.92), Theme.woodGrain]),
                startPoint: CGPoint(x: board.midX, y: board.minY),
                endPoint: CGPoint(x: board.midX, y: board.maxY)
            )
        )
        // Grain.
        for i in 1..<8 {
            let x = board.minX + board.width * Double(i) / 8
            var grain = Path()
            grain.move(to: CGPoint(x: x, y: board.minY + 2))
            grain.addCurve(
                to: CGPoint(x: x + 2, y: board.maxY - 2),
                control1: CGPoint(x: x + 4, y: board.minY + board.height * 0.33),
                control2: CGPoint(x: x - 3, y: board.minY + board.height * 0.66)
            )
            ctx.stroke(grain, with: .color(Theme.woodGrain.opacity(0.5)), lineWidth: 1)
        }
        ctx.stroke(Path(roundedRect: board, cornerRadius: 3), with: .color(Theme.woodDark), lineWidth: 3)

        let hole = map.point(Court.holeCenter)
        let r = map.length(Court.holeRadius)
        let holeRect = CGRect(x: hole.x - r, y: hole.y - r, width: 2 * r, height: 2 * r)
        ctx.fill(Path(ellipseIn: holeRect), with: .radialGradient(
            Gradient(colors: [.black, Theme.hole]),
            center: CGPoint(x: hole.x, y: hole.y - r * 0.3),
            startRadius: 0,
            endRadius: r
        ))
        ctx.stroke(Path(ellipseIn: holeRect), with: .color(Theme.woodDark), lineWidth: 1.5)
    }

    private func drawAimLine(_ ctx: inout GraphicsContext, map: BoardMapping, ideal: ThrowParams, landing: Vec2, player: Int) {
        // The flight path seen from above, coming in from the thrower's side.
        let dir = Vec2(x: sin(ideal.azimuth), y: cos(ideal.azimuth))
        let start = landing - dir * 6
        var path = Path()
        path.move(to: map.point(start))
        path.addLine(to: map.point(landing))
        ctx.stroke(path, with: .color(Theme.player[player].opacity(0.55)), style: StrokeStyle(lineWidth: 2, dash: [2, 5]))
    }

    private func drawPreview(_ ctx: inout GraphicsContext, map: BoardMapping, preview: ThrowPreview) {
        guard preview.slide.count > 1 else { return }
        var path = Path()
        path.move(to: map.point(preview.slide[0]))
        for p in preview.slide.dropFirst() { path.addLine(to: map.point(p)) }
        ctx.stroke(path, with: .color(.white.opacity(0.8)), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [5, 5]))
        if preview.outcome != .inHole {
            let p = map.point(preview.finalPosition)
            let s = map.length(Court.bagSize)
            ctx.stroke(
                Path(roundedRect: CGRect(x: p.x - s / 2, y: p.y - s / 2, width: s, height: s), cornerRadius: s * 0.2),
                with: .color(.white.opacity(0.7)),
                style: StrokeStyle(lineWidth: 1.5, dash: [3, 3])
            )
        }
    }

    private func drawBag(_ ctx: inout GraphicsContext, map: BoardMapping, bag: Bag, lift: Double = 0) {
        let center = map.point(bag.position)
        let size = map.length(Court.bagSize) * (1 + lift)
        var c = ctx
        c.translateBy(x: center.x, y: center.y)
        c.rotate(by: .radians(bag.angle))
        let rect = CGRect(x: -size / 2, y: -size / 2, width: size, height: size)
        let onGround = bag.state == .ground
        let fill = onGround ? Theme.playerDark[bag.owner] : Theme.player[bag.owner]
        c.fill(Path(roundedRect: rect.offsetBy(dx: 1.5, dy: 2), cornerRadius: size * 0.22), with: .color(.black.opacity(0.3)))
        c.fill(Path(roundedRect: rect, cornerRadius: size * 0.22), with: .color(fill))
        c.stroke(
            Path(roundedRect: rect.insetBy(dx: size * 0.12, dy: size * 0.12), cornerRadius: size * 0.12),
            with: .color(.white.opacity(0.45)),
            style: StrokeStyle(lineWidth: 1, dash: [2, 2])
        )
        c.stroke(Path(roundedRect: rect, cornerRadius: size * 0.22), with: .color(Theme.playerDark[bag.owner]), lineWidth: 1.5)
    }

    private func drawFlyingBag(_ ctx: inout GraphicsContext, map: BoardMapping, bag: Bag) {
        let above = max(0, bag.height - Court.surfaceHeight(at: bag.position))
        // Shadow on the board/grass.
        let shadowCenter = map.point(bag.position)
        let s = map.length(Court.bagSize) * (1 - min(0.5, above * 0.04))
        ctx.fill(
            Path(ellipseIn: CGRect(x: shadowCenter.x - s / 2, y: shadowCenter.y - s / 2, width: s, height: s)),
            with: .color(.black.opacity(max(0.1, 0.35 - above * 0.02)))
        )
        // The bag itself is drawn bigger the higher it is (closer to the camera).
        var lifted = bag
        lifted.position.y += above * 0.08
        drawBag(&ctx, map: map, bag: lifted, lift: min(1.2, above * 0.09))
    }

    private func drawLandingMarker(_ ctx: inout GraphicsContext, map: BoardMapping, at p: Vec2) {
        let c = map.point(p)
        let r = map.length(0.2)
        let ring = CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)
        ctx.stroke(Path(ellipseIn: ring), with: .color(.black.opacity(0.5)), lineWidth: 4)
        ctx.stroke(Path(ellipseIn: ring), with: .color(Theme.landingMarker), lineWidth: 2.5)
        var cross = Path()
        cross.move(to: CGPoint(x: c.x - r * 1.5, y: c.y))
        cross.addLine(to: CGPoint(x: c.x + r * 1.5, y: c.y))
        cross.move(to: CGPoint(x: c.x, y: c.y - r * 1.5))
        cross.addLine(to: CGPoint(x: c.x, y: c.y + r * 1.5))
        ctx.stroke(cross, with: .color(Theme.landingMarker), lineWidth: 1.5)
    }

    private func drawEndMarker(_ ctx: inout GraphicsContext, map: BoardMapping, at p: Vec2) {
        let c = map.point(p)
        let r = map.length(0.16)
        let ring = CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)
        ctx.stroke(Path(ellipseIn: ring.insetBy(dx: -3, dy: -3)), with: .color(.black.opacity(0.5)), lineWidth: 2)
        ctx.stroke(Path(ellipseIn: ring.insetBy(dx: -3, dy: -3)), with: .color(Theme.endMarker), lineWidth: 2.5)
        ctx.fill(Path(ellipseIn: ring.insetBy(dx: r * 0.55, dy: r * 0.55)), with: .color(Theme.endMarker))
    }
}
