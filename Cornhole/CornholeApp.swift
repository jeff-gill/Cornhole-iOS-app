import SwiftUI

@main
struct CornholeApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

struct RootView: View {
    @State private var game: GameModel?

    var body: some View {
        Group {
            if let game {
                GameView(game: game, onQuit: { self.game = nil })
                    .transition(.move(edge: .trailing))
            } else {
                MenuView { mode, difficulty in
                    game = GameModel(mode: mode, difficulty: difficulty)
                }
                .transition(.move(edge: .leading))
            }
        }
        .animation(.easeInOut(duration: 0.3), value: game == nil)
    }
}
