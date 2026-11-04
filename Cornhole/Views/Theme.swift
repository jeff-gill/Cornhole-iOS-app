import SwiftUI

enum Theme {
    static let player = [
        Color(red: 0.86, green: 0.20, blue: 0.20),
        Color(red: 0.16, green: 0.42, blue: 0.86),
    ]
    static let playerDark = [
        Color(red: 0.55, green: 0.10, blue: 0.10),
        Color(red: 0.08, green: 0.24, blue: 0.55),
    ]
    static let grass = Color(red: 0.30, green: 0.55, blue: 0.25)
    static let grassDark = Color(red: 0.22, green: 0.44, blue: 0.19)
    static let wood = Color(red: 0.86, green: 0.70, blue: 0.47)
    static let woodDark = Color(red: 0.62, green: 0.45, blue: 0.26)
    static let woodGrain = Color(red: 0.78, green: 0.61, blue: 0.39)
    static let hole = Color(red: 0.12, green: 0.09, blue: 0.07)
    static let skyTop = Color(red: 0.47, green: 0.71, blue: 0.93)
    static let skyBottom = Color(red: 0.80, green: 0.90, blue: 0.98)
    static let landingMarker = Color.yellow
    static let endMarker = Color(red: 0.25, green: 1.0, blue: 0.55)
    static let panel = Color(red: 0.10, green: 0.12, blue: 0.14)

    static func color(for player: Int?) -> Color {
        guard let player, player >= 0, player < 2 else { return .white }
        return Theme.player[player]
    }
}
