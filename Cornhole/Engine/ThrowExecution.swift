import Foundation

enum Difficulty: String, CaseIterable, Identifiable, Codable {
    case easy
    case medium
    case hard
    case pro

    var id: String { rawValue }

    var title: String {
        switch self {
        case .easy: return "Backyard"
        case .medium: return "Tailgate"
        case .hard: return "League"
        case .pro: return "Pro"
        }
    }

    var subtitle: String {
        switch self {
        case .easy: return "Slow meters, full trajectory preview"
        case .medium: return "Quicker meters, full trajectory preview"
        case .hard: return "Fast meters, landing spot only"
        case .pro: return "Very fast meters, tiny sweet spot"
        }
    }

    /// Full back-and-forth swings of a meter needle per second.
    var meterFrequency: Double {
        switch self {
        case .easy: return 0.42
        case .medium: return 0.62
        case .hard: return 0.85
        case .pro: return 1.15
        }
    }

    /// Needle distance from centre (0...1) that still counts as perfect.
    var perfectZone: Double {
        switch self {
        case .easy: return 0.08
        case .medium: return 0.06
        case .hard: return 0.045
        case .pro: return 0.03
        }
    }

    /// How sloppy a computer opponent is at this level (std-dev of its meter stops).
    var cpuSpread: Double {
        switch self {
        case .easy: return 0.42
        case .medium: return 0.26
        case .hard: return 0.15
        case .pro: return 0.08
        }
    }

    var showsTrajectoryPreview: Bool { self == .easy || self == .medium }
}

/// The three skill meters a throw goes through.
enum MeterKind: Int, CaseIterable, Identifiable {
    case direction
    case power
    case height

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .direction: return "Direction"
        case .power: return "Strength"
        case .height: return "Height"
        }
    }

    var lowWord: String {
        switch self {
        case .direction: return "Left"
        case .power: return "Short"
        case .height: return "Flat"
        }
    }

    var highWord: String {
        switch self {
        case .direction: return "Right"
        case .power: return "Long"
        case .height: return "High"
        }
    }
}

struct ThrowErrors: Equatable {
    var direction = 0.0
    var power = 0.0
    var height = 0.0

    subscript(kind: MeterKind) -> Double {
        get {
            switch kind {
            case .direction: return direction
            case .power: return power
            case .height: return height
            }
        }
        set {
            switch kind {
            case .direction: direction = newValue
            case .power: power = newValue
            case .height: height = newValue
            }
        }
    }
}

/// Turns meter stops into a real (imperfect) release.
enum ThrowExecution {
    /// What a full-scale miss on each meter does to the release.
    static let maxDirectionError = 4.0.radians
    static let maxPowerError = 0.10
    static let maxHeightError = 9.0.radians

    /// Needle position in -1...1. Starts hard left, sweeps fastest through the middle.
    static func needle(at time: Double, difficulty: Difficulty) -> Double {
        -cos(2 * .pi * difficulty.meterFrequency * time)
    }

    static func effective(_ error: Double, difficulty: Difficulty) -> Double {
        abs(error) <= difficulty.perfectZone ? 0 : error.clamped(-1, 1)
    }

    static func apply(_ errors: ThrowErrors, to ideal: ThrowParams, difficulty: Difficulty) -> ThrowParams {
        var t = ideal
        t.azimuth += effective(errors.direction, difficulty: difficulty) * maxDirectionError
        t.speed *= 1 + effective(errors.power, difficulty: difficulty) * maxPowerError
        t.elevation = (t.elevation + effective(errors.height, difficulty: difficulty) * maxHeightError)
            .clamped(4.0.radians, 78.0.radians)
        return t
    }

    static func isPerfect(_ errors: ThrowErrors, difficulty: Difficulty) -> Bool {
        MeterKind.allCases.allSatisfy { effective(errors[$0], difficulty: difficulty) == 0 }
    }

    static func grade(_ error: Double, kind: MeterKind, difficulty: Difficulty) -> String {
        let e = effective(error, difficulty: difficulty)
        if e == 0 { return "Perfect" }
        let side = e < 0 ? kind.lowWord : kind.highWord
        switch abs(e) {
        case ..<0.2: return "Slightly \(side.lowercased())"
        case ..<0.5: return side
        default: return "Way \(side.lowercased())"
        }
    }
}
