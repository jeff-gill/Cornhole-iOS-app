import Foundation

/// Cancellation scoring: bag in the hole = 3, bag on the board = 1, and only the
/// difference between the two players is awarded each inning.
struct InningResult: Equatable {
    var inHole: [Int]
    var onBoard: [Int]
    var raw: [Int]
    var winner: Int?
    var awarded: Int

    init(bags: [Bag]) {
        var inHole = [0, 0]
        var onBoard = [0, 0]
        for bag in bags where bag.owner == 0 || bag.owner == 1 {
            switch bag.points {
            case 3: inHole[bag.owner] += 1
            case 1: onBoard[bag.owner] += 1
            default: break
            }
        }
        let raw = [inHole[0] * 3 + onBoard[0], inHole[1] * 3 + onBoard[1]]
        self.inHole = inHole
        self.onBoard = onBoard
        self.raw = raw
        if raw[0] == raw[1] {
            winner = nil
            awarded = 0
        } else {
            winner = raw[0] > raw[1] ? 0 : 1
            awarded = abs(raw[0] - raw[1])
        }
    }
}

enum Rules {
    static let bagsPerInning = 4
    static let winningScore = 21
}

/// A computer opponent. It picks spots the way a decent player would, then "presses"
/// the meters with a skill-dependent wobble.
enum CPUPlayer {
    struct Plan {
        var landing: Vec2
        var end: Vec2?
        var description: String
    }

    static func plan(for player: Int, bags: [Bag]) -> Plan {
        let origin = Court.releasePoint(forPlayer: player).xy
        let hole = Court.holeCenter
        let dir = (hole - origin).normalized
        let landing = hole - dir * 1.7
        let end = hole + dir * 0.1

        let boardBags = bags.filter { $0.isOnBoardSurface }
        let blocker = boardBags.first { distance(from: $0.position, toSegment: landing, hole) < 0.42 }

        guard let blocker else {
            return Plan(landing: landing, end: end, description: "Slide it in")
        }

        // Own bag sitting in front of the hole: push it in.
        if blocker.owner == player, blocker.position.distance(to: hole) < 1.6, blocker.position.distance(to: landing) > 0.5 {
            return Plan(landing: landing, end: hole, description: "Push it in")
        }

        // Opponent bag sitting right in front of the hole: knock it off the line and follow it in.
        if blocker.owner != player, blocker.position.distance(to: hole) < 0.9, Bool.random() {
            let push = blocker.position - dir * 0.9
            return Plan(landing: push, end: hole + dir * 0.4, description: "Push through")
        }
        // Otherwise go over the top.
        return Plan(landing: hole, end: hole, description: "Airmail")
    }

    static func errors(difficulty: Difficulty) -> ThrowErrors {
        ThrowErrors(
            direction: gaussian(difficulty.cpuSpread),
            power: gaussian(difficulty.cpuSpread),
            height: gaussian(difficulty.cpuSpread)
        )
    }

    private static func gaussian(_ sigma: Double) -> Double {
        let u1 = Double.random(in: 1e-9..<1)
        let u2 = Double.random(in: 0..<1)
        let z = (-2 * log(u1)).squareRoot() * cos(2 * .pi * u2)
        return (z * sigma).clamped(-1, 1)
    }

    private static func distance(from p: Vec2, toSegment a: Vec2, _ b: Vec2) -> Double {
        let ab = b - a
        let t = ((p - a).dot(ab) / max(ab.lengthSquared, 1e-9)).clamped(0, 1)
        return p.distance(to: a + ab * t)
    }
}
