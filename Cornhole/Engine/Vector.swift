import Foundation

/// Minimal 2D vector used for the top-down (board plane) simulation.
/// Units are feet. `x` is lateral (right is positive), `y` is down-range.
struct Vec2: Equatable, Hashable {
    var x: Double
    var y: Double

    static let zero = Vec2(x: 0, y: 0)

    var length: Double { (x * x + y * y).squareRoot() }
    var lengthSquared: Double { x * x + y * y }

    var normalized: Vec2 {
        let l = length
        return l > 1e-9 ? Vec2(x: x / l, y: y / l) : .zero
    }

    func dot(_ o: Vec2) -> Double { x * o.x + y * o.y }
    func distance(to o: Vec2) -> Double { (self - o).length }

    static func + (a: Vec2, b: Vec2) -> Vec2 { Vec2(x: a.x + b.x, y: a.y + b.y) }
    static func - (a: Vec2, b: Vec2) -> Vec2 { Vec2(x: a.x - b.x, y: a.y - b.y) }
    static func * (a: Vec2, s: Double) -> Vec2 { Vec2(x: a.x * s, y: a.y * s) }
    static func * (s: Double, a: Vec2) -> Vec2 { Vec2(x: a.x * s, y: a.y * s) }
    static func / (a: Vec2, s: Double) -> Vec2 { Vec2(x: a.x / s, y: a.y / s) }
    static prefix func - (a: Vec2) -> Vec2 { Vec2(x: -a.x, y: -a.y) }
    static func += (a: inout Vec2, b: Vec2) { a = a + b }
    static func -= (a: inout Vec2, b: Vec2) { a = a - b }
}

/// 3D vector. `z` is height above the ground.
struct Vec3: Equatable, Hashable {
    var x: Double
    var y: Double
    var z: Double

    static let zero = Vec3(x: 0, y: 0, z: 0)

    init(x: Double, y: Double, z: Double) {
        self.x = x
        self.y = y
        self.z = z
    }

    init(_ xy: Vec2, z: Double) {
        self.x = xy.x
        self.y = xy.y
        self.z = z
    }

    var xy: Vec2 { Vec2(x: x, y: y) }
    var length: Double { (x * x + y * y + z * z).squareRoot() }

    func dot(_ o: Vec3) -> Double { x * o.x + y * o.y + z * o.z }

    static func + (a: Vec3, b: Vec3) -> Vec3 { Vec3(x: a.x + b.x, y: a.y + b.y, z: a.z + b.z) }
    static func - (a: Vec3, b: Vec3) -> Vec3 { Vec3(x: a.x - b.x, y: a.y - b.y, z: a.z - b.z) }
    static func * (a: Vec3, s: Double) -> Vec3 { Vec3(x: a.x * s, y: a.y * s, z: a.z * s) }
}

extension Double {
    var degrees: Double { self * 180 / .pi }
    var radians: Double { self * .pi / 180 }

    func clamped(_ lo: Double, _ hi: Double) -> Double { Swift.min(Swift.max(self, lo), hi) }
}

extension Vec2 {
    /// Rotates clockwise as seen from above (toward +x when heading down-range), i.e. heading increases by `a`.
    func rotated(by a: Double) -> Vec2 {
        let c = cos(a), s = sin(a)
        return Vec2(x: x * c + y * s, y: -x * s + y * c)
    }

    /// Compass-style heading: 0 is straight down-range, positive is to the right.
    var heading: Double { atan2(x, y) }
}

/// Wraps an angle into -pi...pi.
func wrapAngle(_ a: Double) -> Double { atan2(sin(a), cos(a)) }
