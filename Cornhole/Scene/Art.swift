import UIKit

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        )
    }
}

/// Colours shared by the SpriteKit art.
enum Palette {
    static let player = [UIColor(hex: 0xD9412F), UIColor(hex: 0x2F6FD9)]
    static let playerDark = [UIColor(hex: 0x8C2318), UIColor(hex: 0x173F85)]
    static let playerLight = [UIColor(hex: 0xF47A62), UIColor(hex: 0x6AA2F5)]
    static let skin = [UIColor(hex: 0xE3B088), UIColor(hex: 0x9A6646)]
    static let skinDark = [UIColor(hex: 0xC58F68), UIColor(hex: 0x7C4F34)]
    static let hair = [UIColor(hex: 0x5A3A22), UIColor(hex: 0x1D1512)]
    static let shorts = UIColor(hex: 0x2A2F38)
    static let shortsDark = UIColor(hex: 0x1F232A)
    static let navy = UIColor(hex: 0x1F3552)
    static let gold = UIColor(hex: 0xF4C542)
    static let go = UIColor(hex: 0x4BE38A)
    static let hole = UIColor(hex: 0x140D08)
    static let panel = UIColor(hex: 0x17201B)
}

/// Procedurally painted textures. Everything is drawn once per layout, so the game ships with no image files.
enum Art {
    private static let space = CGColorSpaceCreateDeviceRGB()

    private static func gradient(_ colors: [UIColor], _ locations: [CGFloat]) -> CGGradient {
        CGGradient(colorsSpace: space, colors: colors.map { $0.cgColor } as CFArray, locations: locations)!
    }

    private static func fillLinear(_ c: CGContext, _ colors: [UIColor], _ locations: [CGFloat], from: CGPoint, to: CGPoint) {
        c.drawLinearGradient(gradient(colors, locations), start: from, end: to,
                             options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    }

    private static func polygon(_ c: CGContext, _ points: [CGPoint]) {
        guard let first = points.first else { return }
        c.beginPath()
        c.move(to: first)
        for p in points.dropFirst() { c.addLine(to: p) }
        c.closePath()
    }

    private static func woodGrain(_ c: CGContext, in r: CGRect, rng: inout SeededRandom, color: UIColor, count: Int, alpha: CGFloat) {
        c.setLineCap(.round)
        for _ in 0..<count {
            let x0 = r.minX + rng.next() * r.width
            let amp = 0.5 + rng.next() * 2.5
            let freq = 2 + rng.next() * 4
            let phase = rng.next() * 6
            c.setStrokeColor(color.withAlphaComponent(alpha * (0.4 + rng.next() * 0.8)).cgColor)
            c.setLineWidth(0.3 + rng.next() * 0.9)
            c.beginPath()
            for k in 0...24 {
                let t = CGFloat(k) / 24
                let p = CGPoint(x: x0 + sin(t * freq + phase) * amp, y: r.minY + r.height * t)
                if k == 0 { c.move(to: p) } else { c.addLine(to: p) }
            }
            c.strokePath()
        }
    }

    // MARK: Lawn

    static func grass(size: CGSize, footScale s: CGFloat) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            var rng = SeededRandom(seed: 11)
            fillLinear(c, [UIColor(hex: 0x4A8A3D), UIColor(hex: 0x57983F)], [0, 1], from: .zero, to: CGPoint(x: 0, y: size.height))
            // Mowing stripes, a foot wide.
            var y: CGFloat = 0
            var k = 0
            while y < size.height && s > 1 {
                c.setFillColor(k % 2 == 0 ? UIColor(white: 1, alpha: 0.055).cgColor : UIColor(red: 0, green: 0.12, blue: 0, alpha: 0.06).cgColor)
                c.fill(CGRect(x: 0, y: y, width: size.width, height: s))
                y += s
                k += 1
            }
            // Blades.
            c.setLineCap(.round)
            let n = min(9000, Int(size.width * size.height / 22))
            for _ in 0..<n {
                let x = rng.next() * size.width
                let y0 = rng.next() * size.height
                let len = 2 + rng.next() * 4
                let a = -CGFloat.pi / 2 + (rng.next() - 0.5) * 0.9
                c.setStrokeColor(UIColor(hue: (92 + rng.next() * 22) / 360, saturation: 0.45 + rng.next() * 0.25,
                                         brightness: 0.3 + rng.next() * 0.35, alpha: 0.35 + rng.next() * 0.4).cgColor)
                c.setLineWidth(0.5 + rng.next() * 0.6)
                c.beginPath()
                c.move(to: CGPoint(x: x, y: y0))
                c.addLine(to: CGPoint(x: x + cos(a) * len, y: y0 + sin(a) * len))
                c.strokePath()
            }
            // Vignette.
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            c.drawRadialGradient(gradient([UIColor(white: 0, alpha: 0), UIColor(red: 0, green: 0.08, blue: 0, alpha: 0.32)], [0, 1]),
                                 startCenter: center, startRadius: min(size.width, size.height) * 0.35,
                                 endCenter: center, endRadius: max(size.width, size.height) * 0.75,
                                 options: [.drawsAfterEndLocation])
        }
    }

    // MARK: Board, seen from above

    /// Returns the board image (back of the board at the top) and the padding around it.
    static func boardTop(footScale s: CGFloat) -> (image: UIImage, padding: CGFloat) {
        let bw = 2 * CGFloat(Court.boardHalfWidth) * s
        let bh = CGFloat(Court.boardBackY - Court.boardFrontY) * s
        let pad = ceil(0.5 * s)
        let size = CGSize(width: bw + 2 * pad, height: bh + 2 * pad)
        let image = UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            var rng = SeededRandom(seed: 5)
            let X = pad, Y = pad

            // Shadow: the raised back throws a longer one.
            c.saveGState()
            c.setShadow(offset: .zero, blur: 0.18 * s, color: UIColor(white: 0, alpha: 0.5).cgColor)
            c.setFillColor(UIColor(white: 0, alpha: 0.42).cgColor)
            polygon(c, [CGPoint(x: X + 0.05 * s, y: Y + bh + 0.02 * s), CGPoint(x: X + bw + 0.07 * s, y: Y + bh + 0.02 * s),
                        CGPoint(x: X + bw + 0.3 * s, y: Y + 0.12 * s), CGPoint(x: X + 0.25 * s, y: Y + 0.12 * s)])
            c.fillPath()
            c.restoreGState()

            // Frame (2x4 rim).
            let outer = UIBezierPath(roundedRect: CGRect(x: X, y: Y, width: bw, height: bh), cornerRadius: 0.06 * s)
            c.saveGState()
            c.addPath(outer.cgPath)
            c.clip()
            fillLinear(c, [UIColor(hex: 0xA8773F), UIColor(hex: 0xC08C50), UIColor(hex: 0x946634)], [0, 0.5, 1],
                       from: CGPoint(x: X, y: 0), to: CGPoint(x: X + bw, y: 0))
            c.restoreGState()

            // Plywood top.
            let rim = 0.07 * s
            let top = CGRect(x: X + rim, y: Y + rim, width: bw - 2 * rim, height: bh - 2 * rim)
            let topPath = UIBezierPath(roundedRect: top, cornerRadius: 0.03 * s)
            c.saveGState()
            c.addPath(topPath.cgPath)
            c.clip()
            fillLinear(c, [UIColor(hex: 0xE9CB98), UIColor(hex: 0xDFB880), UIColor(hex: 0xE6C48F), UIColor(hex: 0xD8AD74)],
                       [0, 0.35, 0.7, 1], from: CGPoint(x: top.minX, y: 0), to: CGPoint(x: top.maxX, y: 0))
            woodGrain(c, in: top, rng: &rng, color: UIColor(red: 0.55, green: 0.35, blue: 0.16, alpha: 1), count: 70, alpha: 0.16)
            for _ in 0..<2 { // knots
                let k = CGPoint(x: top.minX + (0.2 + rng.next() * 0.6) * top.width, y: top.minY + (0.15 + rng.next() * 0.7) * top.height)
                c.setFillColor(UIColor(red: 0.5, green: 0.31, blue: 0.14, alpha: 0.25).cgColor)
                c.fillEllipse(in: CGRect(x: k.x - 1.2, y: k.y - 2.6, width: 2.4, height: 5.2))
                c.setStrokeColor(UIColor(red: 0.47, green: 0.27, blue: 0.12, alpha: 0.12).cgColor)
                c.setLineWidth(0.6)
                c.strokeEllipse(in: CGRect(x: k.x - 2.5, y: k.y - 5.2, width: 5, height: 10.4))
            }

            // Painted design: navy band with gold pinstripes running diagonally across the lower half.
            c.saveGState()
            c.setAlpha(0.9)
            func band(_ y0: CGFloat, _ y1: CGFloat, _ color: UIColor) {
                c.setFillColor(color.cgColor)
                polygon(c, [CGPoint(x: top.minX - 5, y: top.minY + top.height * y0 + 0.5 * s),
                            CGPoint(x: top.maxX + 5, y: top.minY + top.height * y0 - 0.5 * s),
                            CGPoint(x: top.maxX + 5, y: top.minY + top.height * y1 - 0.5 * s),
                            CGPoint(x: top.minX - 5, y: top.minY + top.height * y1 + 0.5 * s)])
                c.fillPath()
            }
            band(0.585, 0.6, Palette.gold)
            band(0.61, 0.76, Palette.navy)
            band(0.77, 0.785, Palette.gold)
            c.setStrokeColor(Palette.navy.cgColor)
            c.setLineWidth(0.035 * s)
            c.addPath(UIBezierPath(roundedRect: top.insetBy(dx: 0.09 * s, dy: 0.09 * s), cornerRadius: 0.05 * s).cgPath)
            c.strokePath()
            let hole = CGPoint(x: X + bw / 2, y: Y + 0.75 * s)
            let hr = CGFloat(Court.holeRadius) * s
            c.setStrokeColor(Palette.gold.cgColor)
            c.setLineWidth(0.05 * s)
            c.strokeEllipse(in: CGRect(x: hole.x - hr - 0.1 * s, y: hole.y - hr - 0.1 * s, width: 2 * (hr + 0.1 * s), height: 2 * (hr + 0.1 * s)))
            c.setStrokeColor(Palette.navy.cgColor)
            c.setLineWidth(0.025 * s)
            c.strokeEllipse(in: CGRect(x: hole.x - hr - 0.16 * s, y: hole.y - hr - 0.16 * s, width: 2 * (hr + 0.16 * s), height: 2 * (hr + 0.16 * s)))
            c.restoreGState()
            woodGrain(c, in: top, rng: &rng, color: UIColor(red: 0.35, green: 0.22, blue: 0.08, alpha: 1), count: 40, alpha: 0.07)

            // Varnish sheen.
            fillLinear(c, [UIColor(white: 1, alpha: 0.22), UIColor(white: 1, alpha: 0), UIColor(white: 0, alpha: 0.06)], [0, 0.45, 1],
                       from: CGPoint(x: top.minX, y: top.minY), to: CGPoint(x: top.minX + top.width * 0.8, y: top.minY + top.height * 0.6))
            c.restoreGState()

            c.setStrokeColor(UIColor(red: 1, green: 0.94, blue: 0.82, alpha: 0.35).cgColor)
            c.setLineWidth(0.7)
            c.addPath(topPath.cgPath)
            c.strokePath()
            c.setStrokeColor(UIColor(red: 0.27, green: 0.16, blue: 0.06, alpha: 0.8).cgColor)
            c.setLineWidth(1.2)
            c.addPath(outer.cgPath)
            c.strokePath()

            // The hole: dark, with the far inner wall catching the light.
            let holeRect = CGRect(x: hole.x - hr, y: hole.y - hr, width: 2 * hr, height: 2 * hr)
            c.saveGState()
            c.addEllipse(in: holeRect)
            c.clip()
            c.setFillColor(UIColor(hex: 0x8A6034).cgColor)
            c.fill(holeRect)
            c.addEllipse(in: holeRect.offsetBy(dx: 0, dy: 0.09 * s))
            c.clip()
            c.drawRadialGradient(gradient([.black, Palette.hole], [0, 1]),
                                 startCenter: CGPoint(x: hole.x, y: hole.y + hr * 0.3), startRadius: 0,
                                 endCenter: CGPoint(x: hole.x, y: hole.y + hr * 0.25), endRadius: hr * 1.1,
                                 options: [.drawsAfterEndLocation])
            c.restoreGState()
            c.setStrokeColor(UIColor(red: 0.24, green: 0.14, blue: 0.06, alpha: 0.9).cgColor)
            c.setLineWidth(1.2)
            c.strokeEllipse(in: holeRect)
        }
        return (image, pad)
    }

    // MARK: Backyard, seen from the side (includes both boards)

    static func sideScene(map m: SideMap) -> UIImage {
        let size = m.rect.size
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            var rng = SeededRandom(seed: 3)
            let W = size.width
            let gy = size.height - m.groundStrip
            let kx = m.kx, kz = m.kz

            // Golden-hour sky with the sun low on the right.
            fillLinear(c, [UIColor(hex: 0x2C5D94), UIColor(hex: 0x86B5D8), UIColor(hex: 0xF3CF96), UIColor(hex: 0xF6B978)],
                       [0, 0.55, 0.85, 1], from: .zero, to: CGPoint(x: 0, y: gy))
            let sun = CGPoint(x: W * 0.8, y: gy * 0.5)
            c.drawRadialGradient(gradient([UIColor(red: 1, green: 0.94, blue: 0.75, alpha: 0.9), UIColor(red: 1, green: 0.86, blue: 0.59, alpha: 0.45),
                                           UIColor(red: 1, green: 0.78, blue: 0.47, alpha: 0)], [0, 0.12, 1]),
                                 startCenter: sun, startRadius: 0, endCenter: sun, endRadius: size.height * 0.9, options: [])
            c.setFillColor(UIColor(hex: 0xFFF6D8).cgColor)
            c.fillEllipse(in: CGRect(x: sun.x - size.height * 0.07, y: sun.y - size.height * 0.07, width: size.height * 0.14, height: size.height * 0.14))

            // Clouds.
            for i in 0..<4 {
                let cx = (0.08 + CGFloat(i) * 0.25 + rng.next() * 0.08) * W
                let cy = (0.12 + rng.next() * 0.22) * gy
                let w = (0.07 + rng.next() * 0.06) * W
                c.setFillColor(UIColor(white: 1, alpha: 0.55).cgColor)
                for _ in 0..<6 {
                    let rx = w * (0.25 + rng.next() * 0.2), ry = w * (0.1 + rng.next() * 0.08)
                    let x = cx + (rng.next() - 0.5) * w, y = cy + (rng.next() - 0.5) * w * 0.15
                    c.fillEllipse(in: CGRect(x: x - rx, y: y - ry, width: 2 * rx, height: 2 * ry))
                }
            }

            // Hazy hills, then two rows of trees.
            c.setFillColor(UIColor(red: 0.38, green: 0.5, blue: 0.55, alpha: 0.55).cgColor)
            c.beginPath()
            c.move(to: CGPoint(x: 0, y: gy))
            var x: CGFloat = 0
            while x <= W {
                c.addLine(to: CGPoint(x: x, y: gy - kz * (7.5 + 1.5 * sin(x / W * 5 + 1) + sin(x / W * 13) * 0.6)))
                x += 4
            }
            c.addLine(to: CGPoint(x: W, y: gy))
            c.closePath()
            c.fillPath()
            for (color, h0, h1, step) in [(UIColor(hex: 0x3A6A45), 5.5, 9.0, 0.9), (UIColor(hex: 0x2C5535), 4.5, 7.5, 0.7)] {
                c.setFillColor(color.cgColor)
                var y = SideMap.minY - 1
                while y < SideMap.maxY + 1 {
                    let px = m.imagePoint(y, 0).x
                    let h = CGFloat(h0 + Double(rng.next()) * (h1 - h0)) * kz
                    let w = (0.9 + rng.next() * 1.1) * kx
                    c.fillEllipse(in: CGRect(x: px - w, y: gy - h - h * 0.55, width: 2 * w, height: h * 1.1))
                    c.fill(CGRect(x: px - w, y: gy - h, width: 2 * w, height: h))
                    y += step + Double(rng.next()) * step
                }
            }

            // Wooden privacy fence.
            let fh = 4.2 * kz
            let plank = max(3, 0.45 * kx)
            var px: CGFloat = 0
            var k = 0
            while px < W {
                let tones: [UInt32] = k % 3 == 0 ? [0xC99A63, 0x9C6F40] : (k % 3 == 1 ? [0xBF8F58, 0x93663A] : [0xC4955E, 0x986B3D])
                let lift: CGFloat = k % 2 == 0 ? 0 : 1
                let r = CGRect(x: px, y: gy - fh - lift, width: plank - 0.6, height: fh + lift)
                c.saveGState()
                c.clip(to: r)
                fillLinear(c, [UIColor(hex: tones[0]), UIColor(hex: tones[1])], [0, 1], from: CGPoint(x: 0, y: r.minY), to: CGPoint(x: 0, y: r.maxY))
                c.restoreGState()
                px += plank
                k += 1
            }
            c.setFillColor(UIColor(red: 0.24, green: 0.14, blue: 0.06, alpha: 0.35).cgColor)
            c.fill(CGRect(x: 0, y: gy - fh * 0.78, width: W, height: 1))
            c.fill(CGRect(x: 0, y: gy - fh * 0.25, width: W, height: 1))

            // String lights between poles.
            let poles = [m.imagePoint(1.5, 0).x, m.imagePoint(15, 0).x, m.imagePoint(31.5, 0).x]
            let topY = gy - 9.5 * kz
            c.setStrokeColor(UIColor(hex: 0x3B2A1C).cgColor)
            c.setLineWidth(1.6)
            for p in poles {
                c.beginPath(); c.move(to: CGPoint(x: p, y: gy)); c.addLine(to: CGPoint(x: p, y: topY - 3)); c.strokePath()
            }
            for i in 0..<(poles.count - 1) {
                let a = poles[i], b = poles[i + 1], sag = 1.6 * kz
                var pts: [CGPoint] = []
                for j in 0...30 {
                    let t = CGFloat(j) / 30
                    pts.append(CGPoint(x: a + (b - a) * t, y: topY + sag * 4 * t * (1 - t)))
                }
                c.setStrokeColor(UIColor(red: 0.16, green: 0.12, blue: 0.08, alpha: 0.85).cgColor)
                c.setLineWidth(0.8)
                c.beginPath()
                c.addLines(between: pts)
                c.strokePath()
                var j = 2
                while j < 30 {
                    let bulb = CGPoint(x: pts[j].x, y: pts[j].y + 3)
                    c.drawRadialGradient(gradient([UIColor(red: 1, green: 0.93, blue: 0.67, alpha: 0.85), UIColor(red: 1, green: 0.86, blue: 0.55, alpha: 0)], [0, 1]),
                                         startCenter: bulb, startRadius: 0, endCenter: bulb, endRadius: 6, options: [])
                    c.setFillColor(UIColor(hex: 0xFFF4CF).cgColor)
                    c.fillEllipse(in: CGRect(x: bulb.x - 1.4, y: bulb.y - 1.9, width: 2.8, height: 3.8))
                    j += 3
                }
            }

            // Lawn.
            c.saveGState()
            c.clip(to: CGRect(x: 0, y: gy, width: W, height: size.height - gy))
            fillLinear(c, [UIColor(hex: 0x5F9F49), UIColor(hex: 0x3E7632)], [0, 1], from: CGPoint(x: 0, y: gy), to: CGPoint(x: 0, y: size.height))
            c.restoreGState()
            c.setLineCap(.round)
            for _ in 0..<Int(W * 1.4) {
                let bx = rng.next() * W, by = gy + rng.next() * (size.height - gy), len = 2 + rng.next() * 3.5
                c.setStrokeColor(UIColor(hue: (95 + rng.next() * 20) / 360, saturation: 0.5, brightness: 0.35 + rng.next() * 0.25, alpha: 0.7).cgColor)
                c.setLineWidth(0.8)
                c.beginPath(); c.move(to: CGPoint(x: bx, y: by)); c.addLine(to: CGPoint(x: bx + (rng.next() - 0.5) * 2, y: by - len)); c.strokePath()
            }

            // Both boards: the thrower's (front at the foul line, mostly off the left edge) and the target.
            sideBoard(c, m, front: 0, back: -4)
            sideBoard(c, m, front: Court.boardFrontY, back: Court.boardBackY)
            let h0 = Court.holeCenter.y - Court.holeRadius, h1 = Court.holeCenter.y + Court.holeRadius
            c.setStrokeColor(Palette.hole.cgColor)
            c.setLineWidth(2.5)
            c.beginPath()
            c.move(to: m.imagePoint(h0, Court.boardPlaneHeight(atY: h0)))
            c.addLine(to: m.imagePoint(h1, Court.boardPlaneHeight(atY: h1)))
            c.strokePath()
        }
    }

    private static func sideBoard(_ c: CGContext, _ m: SideMap, front: Double, back: Double) {
        let P = m.imagePoint
        let depth = 0.3
        let dir: Double = back > front ? 1 : -1
        let fh = Court.boardFrontHeight, bh = Court.boardBackHeight
        // Back leg.
        let legY = back - dir * 0.35
        let l1 = P(legY, bh - depth), l2 = P(legY + dir * 0.22, 0)
        c.setFillColor(UIColor(hex: 0x7A5430).cgColor)
        polygon(c, [l1, CGPoint(x: l2.x, y: l1.y), CGPoint(x: l2.x + CGFloat(dir) * 1.5, y: l2.y), CGPoint(x: l1.x - CGFloat(dir) * 0.5, y: l2.y)])
        c.fillPath()
        // Painted frame side.
        c.saveGState()
        polygon(c, [P(front, max(0, fh - depth)), P(front, fh), P(back, bh), P(back, bh - depth)])
        c.clip()
        fillLinear(c, [UIColor(hex: 0x284569), UIColor(hex: 0x16273D)], [0, 1], from: P(0, bh), to: P(0, 0))
        c.restoreGState()
        // Gold pinstripe and the wooden top edge.
        c.setStrokeColor(Palette.gold.cgColor)
        c.setLineWidth(0.8)
        c.beginPath(); c.move(to: P(front + dir * 0.15, fh - 0.11)); c.addLine(to: P(back - dir * 0.15, bh - 0.12)); c.strokePath()
        c.setStrokeColor(UIColor(hex: 0xE6C48F).cgColor)
        c.setLineWidth(1.6)
        c.beginPath(); c.move(to: P(front, fh)); c.addLine(to: P(back, bh)); c.strokePath()
    }

    // MARK: Bags

    private static func pillow(_ h: CGFloat, bulge: CGFloat, center: CGPoint) -> CGPath {
        let p = CGMutablePath()
        let cx = center.x, cy = center.y
        p.move(to: CGPoint(x: cx - h, y: cy - h))
        p.addQuadCurve(to: CGPoint(x: cx + h, y: cy - h), control: CGPoint(x: cx, y: cy - h - bulge))
        p.addQuadCurve(to: CGPoint(x: cx + h, y: cy + h), control: CGPoint(x: cx + h + bulge, y: cy))
        p.addQuadCurve(to: CGPoint(x: cx - h, y: cy + h), control: CGPoint(x: cx, y: cy + h + bulge))
        p.addQuadCurve(to: CGPoint(x: cx - h, y: cy - h), control: CGPoint(x: cx - h - bulge, y: cy))
        p.closeSubpath()
        return p
    }

    /// A 6" bag seen from above: shaded duck cloth, stitched seam, pinched corners. `size` is the bag's width in points.
    static func bagTop(owner: Int, dim: Bool, size z: CGFloat) -> UIImage {
        let box = CGSize(width: z * 1.2, height: z * 1.2)
        return UIGraphicsImageRenderer(size: box).image { ctx in
            let c = ctx.cgContext
            let center = CGPoint(x: box.width / 2, y: box.height / 2)
            let h = z / 2
            let body = pillow(h * 0.92, bulge: z * 0.07, center: center)
            c.saveGState()
            c.addPath(body)
            c.clip()
            let light = dim ? Palette.player[owner] : Palette.playerLight[owner]
            let mid = dim ? Palette.playerDark[owner] : Palette.player[owner]
            c.drawRadialGradient(gradient([light, mid, Palette.playerDark[owner]], [0, 0.55, 1]),
                                 startCenter: CGPoint(x: center.x - h * 0.3, y: center.y - h * 0.35), startRadius: z * 0.04,
                                 endCenter: center, endRadius: z * 0.8, options: [.drawsAfterEndLocation])
            // Weave.
            c.setStrokeColor(UIColor(white: 1, alpha: 0.07).cgColor)
            c.setLineWidth(0.5)
            var k = -z
            while k < z {
                c.beginPath()
                c.move(to: CGPoint(x: center.x + k, y: center.y - h))
                c.addLine(to: CGPoint(x: center.x + k + z, y: center.y + h))
                c.strokePath()
                k += 1.8
            }
            c.restoreGState()
            // Seam.
            c.setStrokeColor(UIColor(white: 1, alpha: 0.55).cgColor)
            c.setLineWidth(0.7)
            c.setLineDash(phase: 0, lengths: [1.4, 1.4])
            c.addPath(pillow(h * 0.72, bulge: z * 0.05, center: center))
            c.strokePath()
            c.setLineDash(phase: 0, lengths: [])
            // Corner pinches.
            c.setStrokeColor(UIColor(white: 0, alpha: 0.28).cgColor)
            for (sx, sy) in [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)] {
                c.beginPath()
                c.move(to: CGPoint(x: center.x + CGFloat(sx) * h * 0.9, y: center.y + CGFloat(sy) * h * 0.9))
                c.addLine(to: CGPoint(x: center.x + CGFloat(sx) * h * 0.62, y: center.y + CGFloat(sy) * h * 0.62))
                c.strokePath()
            }
            c.setStrokeColor(UIColor(white: 0, alpha: 0.45).cgColor)
            c.setLineWidth(0.8)
            c.addPath(body)
            c.strokePath()
        }
    }

    /// A bag seen edge-on, for the side view.
    static func bagSide(owner: Int, dim: Bool, size: CGSize) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            let r = CGRect(origin: .zero, size: size).insetBy(dx: 0.5, dy: 0.5)
            let path = UIBezierPath(roundedRect: r, cornerRadius: r.height * 0.45).cgPath
            c.addPath(path)
            c.clip()
            fillLinear(c, [dim ? Palette.player[owner] : Palette.playerLight[owner], Palette.playerDark[owner]], [0, 1],
                       from: CGPoint(x: 0, y: r.minY), to: CGPoint(x: 0, y: r.maxY))
            c.setStrokeColor(UIColor(white: 1, alpha: 0.5).cgColor)
            c.setLineWidth(0.6)
            c.setLineDash(phase: 0, lengths: [1.3, 1.3])
            c.beginPath(); c.move(to: CGPoint(x: r.minX + 2, y: r.midY)); c.addLine(to: CGPoint(x: r.maxX - 2, y: r.midY)); c.strokePath()
        }
    }

    // MARK: Small bits

    /// Soft dark ellipse used for shadows.
    static func softShadow(size: CGSize) -> UIImage {
        UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            c.translateBy(x: center.x, y: center.y)
            c.scaleBy(x: 1, y: size.height / size.width)
            c.drawRadialGradient(gradient([UIColor(white: 0, alpha: 0.55), UIColor(white: 0, alpha: 0)], [0, 1]),
                                 startCenter: .zero, startRadius: 0, endCenter: .zero, endRadius: size.width / 2, options: [])
        }
    }

    static func dot(diameter d: CGFloat) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: d, height: d)).image { ctx in
            ctx.cgContext.setFillColor(UIColor.white.cgColor)
            ctx.cgContext.fillEllipse(in: CGRect(x: 0, y: 0, width: d, height: d))
        }
    }

    static func confettiPiece() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 8, height: 4)).image { ctx in
            ctx.cgContext.setFillColor(UIColor.white.cgColor)
            ctx.cgContext.fill(CGRect(x: 0, y: 0, width: 8, height: 4))
        }
    }
}

// MARK: - Thrower parts (drawn once, then moved/rotated as sprites every frame)

extension Art {
    /// Pixels-per-foot the thrower parts are painted at (they are scaled down on screen).
    static let partScale: CGFloat = 48

    /// A white bar with soft edges and a subtle top-lit gradient; tinted per limb.
    static func limb() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 16, height: 16)).image { ctx in
            let c = ctx.cgContext
            let r = CGRect(x: 0, y: 1, width: 16, height: 14)
            c.saveGState()
            c.clip(to: r)
            c.drawLinearGradient(
                CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                           colors: [UIColor.white.cgColor, UIColor(white: 0.78, alpha: 1).cgColor] as CFArray, locations: [0.2, 1])!,
                start: CGPoint(x: 0, y: r.minY), end: CGPoint(x: 0, y: r.maxY), options: [])
            c.restoreGState()
        }
    }

    /// A white disc with a soft highlight; tinted for joints, hands and so on.
    static func disc() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 32, height: 32)).image { ctx in
            let c = ctx.cgContext
            c.addEllipse(in: CGRect(x: 1, y: 1, width: 30, height: 30))
            c.clip()
            c.drawRadialGradient(
                CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                           colors: [UIColor.white.cgColor, UIColor(white: 0.8, alpha: 1).cgColor] as CFArray, locations: [0, 1])!,
                startCenter: CGPoint(x: 12, y: 11), startRadius: 0, endCenter: CGPoint(x: 16, y: 16), endRadius: 16, options: [.drawsAfterEndLocation])
        }
    }

    /// Jersey torso, hip at the anchor point. Returns the image and the anchor (unit coordinates, y up).
    static func torso(player pl: Int) -> (UIImage, CGPoint) {
        let k = partScale
        let size = CGSize(width: 1.1 * k, height: 2.35 * k)
        // Feet relative to the hip (x forward, y up) -> image (y down).
        func P(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: (x + 0.55) * k, y: (2.25 - y) * k) }
        let image = UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            let body = CGMutablePath()
            body.move(to: P(-0.42, 0.05))
            body.addLine(to: P(0.38, 0.05))
            body.addLine(to: P(0.44, 1.92))
            body.addQuadCurve(to: P(-0.46, 1.92), control: P(0, 2.14))
            body.closeSubpath()
            c.saveGState()
            c.addPath(body)
            c.clip()
            c.drawLinearGradient(gradient([Palette.playerDark[pl], Palette.player[pl], Palette.playerLight[pl]], [0, 0.55, 1]),
                                 start: P(-0.45, 1), end: P(0.45, 1), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
            // Side panel stripe and a darker hem.
            c.setStrokeColor(UIColor(white: 1, alpha: 0.9).cgColor)
            c.setLineWidth(0.09 * k)
            c.beginPath(); c.move(to: P(-0.08, 0.15)); c.addLine(to: P(-0.04, 1.8)); c.strokePath()
            c.setFillColor(UIColor(white: 0, alpha: 0.18).cgColor)
            c.fill(CGRect(x: 0, y: P(0, 0.2).y, width: size.width, height: 0.2 * k))
            // Number on the back.
            let number = NSAttributedString(string: pl == 0 ? "7" : "23", attributes: [
                .font: UIFont.systemFont(ofSize: 0.55 * k, weight: .black),
                .foregroundColor: UIColor(white: 1, alpha: 0.9),
            ])
            number.draw(at: CGPoint(x: P(-0.42, 0).x, y: P(0, 1.45).y))
            c.restoreGState()
            // Collar.
            c.setStrokeColor(Palette.playerDark[pl].cgColor)
            c.setLineWidth(0.06 * k)
            c.addPath(body)
            c.strokePath()
            c.setStrokeColor(UIColor(white: 1, alpha: 0.85).cgColor)
            c.setLineWidth(0.07 * k)
            c.beginPath(); c.addArc(center: P(0.02, 2.0), radius: 0.2 * k, startAngle: 0.2, endAngle: .pi - 0.2, clockwise: false); c.strokePath()
        }
        return (image, CGPoint(x: 0.5, y: 0.1 / 2.35))
    }

    /// Head with hair, face, ear, eye and team cap; centred on the anchor.
    static func head(player pl: Int) -> UIImage {
        let k = partScale
        let size = CGSize(width: 1.5 * k, height: 1.5 * k)
        let o = CGPoint(x: 0.7 * k, y: 0.8 * k) // head centre
        func P(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: o.x + x * k, y: o.y + y * k) } // y down
        return UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            let r = 0.42 * k
            func disc(_ center: CGPoint, _ radius: CGFloat, _ color: UIColor) {
                c.setFillColor(color.cgColor)
                c.fillEllipse(in: CGRect(x: center.x - radius, y: center.y - radius, width: 2 * radius, height: 2 * radius))
            }
            disc(P(-0.08, 0.02), r, Palette.hair[pl])
            // Face with soft shading.
            let face = P(0.04, 0.04)
            c.saveGState()
            c.addEllipse(in: CGRect(x: face.x - r * 0.95, y: face.y - r * 0.95, width: 1.9 * r, height: 1.9 * r))
            c.clip()
            c.drawRadialGradient(gradient([Palette.skin[pl], Palette.skinDark[pl]], [0.3, 1]),
                                 startCenter: P(0.16, -0.06), startRadius: 0, endCenter: face, endRadius: r * 1.05, options: [.drawsAfterEndLocation])
            c.restoreGState()
            // Nose, ear, eye, smile.
            disc(P(0.42, 0.06), 0.07 * k, Palette.skinDark[pl])
            disc(P(-0.08, 0.08), 0.1 * k, Palette.skinDark[pl])
            disc(P(0.26, -0.02), 0.05 * k, UIColor(white: 0.12, alpha: 1))
            c.setStrokeColor(UIColor(white: 0.15, alpha: 0.6).cgColor)
            c.setLineWidth(0.025 * k)
            c.beginPath(); c.addArc(center: P(0.25, 0.14), radius: 0.09 * k, startAngle: 0.3, endAngle: 1.4, clockwise: false); c.strokePath()
            // Cap: crown, front panel highlight, brim, button.
            c.saveGState()
            let crown = CGMutablePath()
            crown.addArc(center: P(0, -0.05), radius: r * 1.03, startAngle: .pi * 1.02, endAngle: .pi * 1.98, clockwise: false)
            crown.closeSubpath()
            c.addPath(crown)
            c.clip()
            c.drawLinearGradient(gradient([Palette.playerLight[pl], Palette.player[pl], Palette.playerDark[pl]], [0, 0.5, 1]),
                                 start: P(0.3, -0.45), end: P(-0.3, -0.05), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
            c.restoreGState()
            c.setFillColor(Palette.playerDark[pl].cgColor)
            c.addPath(UIBezierPath(roundedRect: CGRect(x: P(0.1, 0).x, y: P(0, -0.13).y, width: 0.6 * k, height: 0.11 * k), cornerRadius: 0.05 * k).cgPath)
            c.fillPath()
            disc(P(0, -0.05 - 0.42 * 1.0), 0.05 * k, .white)
        }
    }

    /// Sneaker, toe pointing right; the anchor is under the heel-to-ball midpoint.
    static func shoe(player pl: Int) -> (UIImage, CGPoint) {
        let k = partScale
        let size = CGSize(width: 0.9 * k, height: 0.4 * k)
        return (UIGraphicsImageRenderer(size: size).image { ctx in
            let c = ctx.cgContext
            let upper = UIBezierPath(roundedRect: CGRect(x: 0.04 * k, y: 0.06 * k, width: 0.8 * k, height: 0.28 * k), cornerRadius: 0.12 * k)
            c.saveGState()
            c.addPath(upper.cgPath)
            c.clip()
            c.drawLinearGradient(gradient([.white, UIColor(hex: 0xD9D3C6)], [0, 1]),
                                 start: .zero, end: CGPoint(x: 0, y: size.height), options: [])
            c.setFillColor(Palette.player[pl].cgColor)
            c.fill(CGRect(x: 0.25 * k, y: 0.12 * k, width: 0.32 * k, height: 0.08 * k))
            c.restoreGState()
            c.setFillColor(UIColor(hex: 0x3A3A3A).cgColor)
            c.fill(CGRect(x: 0.04 * k, y: 0.3 * k, width: 0.8 * k, height: 0.07 * k))
        }, CGPoint(x: 0.27, y: 0.08))
    }
}
