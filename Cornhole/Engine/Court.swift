import Foundation

/// Regulation court geometry, in feet.
///
/// Coordinate system (shared by every view and the physics):
/// - `y` runs down-range. The thrower's foul line (front of their own board) is `y = 0`.
/// - `x` is lateral. The board centre line is `x = 0`; positive is to the thrower's right.
/// - `z` is height above the ground.
///
/// Boards are 27 ft apart front-to-front, 2 ft x 4 ft, the front edge sits 3" off the
/// ground and the back edge 12". The hole is 6" across, centred 9" from the back edge.
enum Court {
    static let gravity = 32.17

    static let boardFrontY = 27.0
    static let boardBackY = 31.0
    static let boardHalfWidth = 1.0
    static let boardFrontHeight = 0.25
    static let boardBackHeight = 1.0

    static let holeCenter = Vec2(x: 0, y: boardBackY - 0.75)
    static let holeRadius = 0.25

    /// A regulation bag is 6" x 6".
    static let bagSize = 0.5
    /// Bags are treated as discs of this radius when they bump into each other.
    static let bagRadius = 0.25

    static let releaseHeight = 3.0
    static let releaseY = 0.5
    /// In singles the two players stand in opposite pitcher's boxes, either side of the board.
    static let releaseOffsetX = 1.6

    static let slopeAngle = atan2(boardBackHeight - boardFrontHeight, boardBackY - boardFrontY)
    static let slopeSin = sin(slopeAngle)
    static let slopeCos = cos(slopeAngle)

    static func releasePoint(forPlayer player: Int) -> Vec3 {
        Vec3(x: player == 0 ? -releaseOffsetX : releaseOffsetX, y: releaseY, z: releaseHeight)
    }

    static func isOnBoard(_ p: Vec2) -> Bool {
        abs(p.x) <= boardHalfWidth && p.y >= boardFrontY && p.y <= boardBackY
    }

    /// Height of the (infinitely extended) board plane at a given down-range distance.
    static func boardPlaneHeight(atY y: Double) -> Double {
        boardFrontHeight + (y - boardFrontY) * (boardBackHeight - boardFrontHeight) / (boardBackY - boardFrontY)
    }

    /// Height of whatever a bag would touch at this spot: the board, or the ground.
    static func surfaceHeight(at p: Vec2) -> Double {
        isOnBoard(p) ? boardPlaneHeight(atY: p.y) : 0
    }

    static func isOverHole(_ p: Vec2, within radius: Double = holeRadius) -> Bool {
        p.distance(to: holeCenter) < radius
    }
}

/// Feel of the game. All the numbers that make bags stick or slide live here.
enum Tuning {
    /// Kinetic friction between bag and board.
    static let friction = 0.35
    /// Fraction of along-board speed kept on a perfectly flat (grazing) landing...
    static let landingRetentionBase = 0.75
    /// ...reduced by this much times how steeply the bag comes down (0 = grazing, 1 = straight down).
    static let landingRetentionSteepness = 0.6
    /// Bag-on-bag bounciness.
    static let restitution = 0.35
    /// A sliding bag drops when its centre gets this close to the hole centre.
    static let holeCaptureRadius = 0.22
    /// Below this speed (ft/s) a bag comes to rest (static friction beats the slope).
    static let stopSpeed = 0.08
    /// Physics timestep.
    static let dt = 1.0 / 240.0
    /// Lowest and highest release angles the thrower can use.
    static let minElevation = 10.0.radians
    static let maxElevation = 65.0.radians
    /// Release angle used when nothing else decides the arc.
    static let defaultElevation = 32.0.radians
    /// At full spin the bag kicks this far sideways when it lands...
    static let spinKick = 9.0.radians
    /// ...and keeps hooking by this many radians per foot of slide.
    static let spinCurve = 0.05
    /// How much a sliding bag carries a resting one along its own line of travel (1 = entirely).
    static let carry = 1.0
}
