import SwiftUI

import SpriteKit

struct GameView: View {
    let game: GameModel
    var onQuit: () -> Void

    @State private var scene: GameScene
    @State private var confirmQuit = false
    @State private var showHelp = false

    init(game: GameModel, onQuit: @escaping () -> Void) {
        self.game = game
        self.onQuit = onQuit
        _scene = State(initialValue: GameScene(game: game))
    }

    var body: some View {
        VStack(spacing: 0) {
            ScoreboardView(game: game, onMenu: { confirmQuit = true }, onHelp: { showHelp = true })
            SpriteView(scene: scene, preferredFramesPerSecond: 60, options: [.ignoresSiblingOrder])
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .overlay(alignment: .bottom) { BannerView(banner: game.banner) }
            ControlPanel(game: game)
        }
        .background(Theme.panel.ignoresSafeArea())
        .overlay {
            switch game.phase {
            case .inningOver:
                if let result = game.lastInning {
                    InningSummaryView(game: game, result: result, buttonTitle: "Next inning") {
                        game.nextInning()
                    }
                }
            case .gameOver:
                if let result = game.lastInning {
                    InningSummaryView(game: game, result: result, buttonTitle: "Play again") {
                        game.restart()
                    } secondary: {
                        onQuit()
                    }
                }
            default:
                EmptyView()
            }
        }
        .confirmationDialog("Leave this game?", isPresented: $confirmQuit, titleVisibility: .visible) {
            Button("Quit to menu", role: .destructive) { onQuit() }
            Button("Keep playing", role: .cancel) {}
        }
        .sheet(isPresented: $showHelp) { HelpView() }
        .statusBarHidden()
    }
}

private struct ScoreboardView: View {
    let game: GameModel
    var onMenu: () -> Void
    var onHelp: () -> Void

    var body: some View {
        let live = game.inningSoFar
        HStack(spacing: 8) {
            Button(action: onMenu) {
                Image(systemName: "chevron.left").font(.headline)
            }
            .foregroundStyle(.white)
            .frame(width: 32)

            playerCard(0, live: live.winner == 0 ? live.awarded : 0)

            VStack(spacing: 0) {
                Text("INNING").font(.system(size: 9, weight: .bold)).foregroundStyle(.white.opacity(0.6))
                Text("\(game.inning)").font(.title3.weight(.heavy).monospacedDigit()).foregroundStyle(.white)
                Text("to \(Rules.winningScore)").font(.system(size: 9, weight: .semibold)).foregroundStyle(.white.opacity(0.6))
            }
            .frame(width: 48)

            playerCard(1, live: live.winner == 1 ? live.awarded : 0)

            Button(action: onHelp) {
                Image(systemName: "questionmark.circle").font(.headline)
            }
            .foregroundStyle(.white)
            .frame(width: 32)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Theme.panel)
    }

    private func playerCard(_ player: Int, live: Int) -> some View {
        let active = game.currentPlayer == player && game.phase != .inningOver && game.phase != .gameOver
        return HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text(game.names[player])
                    .font(.caption.weight(.bold))
                    .lineLimit(1)
                HStack(spacing: 3) {
                    ForEach(0..<Rules.bagsPerInning, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(i < game.bagsRemaining(for: player) ? Color.white : Color.white.opacity(0.25))
                            .frame(width: 8, height: 8)
                    }
                }
                Text(live > 0 ? "Inning +\(live)" : " ")
                    .font(.system(size: 9, weight: .semibold))
                    .opacity(0.85)
            }
            Spacer(minLength: 0)
            Text("\(game.scores[player])")
                .font(.system(size: 30, weight: .black, design: .rounded).monospacedDigit())
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Theme.player[player].opacity(active ? 1 : 0.45))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.white.opacity(active ? 0.9 : 0), lineWidth: 2)
        )
    }
}

private struct BannerView: View {
    let banner: Banner?

    var body: some View {
        ZStack {
            if let banner {
                Text(banner.text)
                    .font(.system(size: 26, weight: .black, design: .rounded))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(Theme.color(for: banner.player).opacity(0.92), in: Capsule())
                    .shadow(radius: 6, y: 3)
                    .transition(.scale.combined(with: .opacity))
                    .id(banner.id)
            }
        }
        .padding(.bottom, 14)
        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: banner)
        .allowsHitTesting(false)
    }
}

private struct InningSummaryView: View {
    let game: GameModel
    let result: InningResult
    let buttonTitle: String
    var primary: () -> Void
    var secondary: (() -> Void)? = nil

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
            VStack(spacing: 16) {
                if let winner = game.winner {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(.yellow)
                    Text("\(game.names[winner]) win\(game.names[winner] == "You" ? "" : "s")!")
                        .font(.largeTitle.weight(.black))
                } else {
                    Text("Inning \(game.inning)")
                        .font(.title.weight(.black))
                }

                HStack(spacing: 12) {
                    column(0)
                    column(1)
                }

                Text(summaryLine)
                    .font(.headline)
                    .multilineTextAlignment(.center)

                Button(action: primary) {
                    Text(buttonTitle)
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.player[result.winner ?? 0])

                if let secondary {
                    Button("Main menu", action: secondary)
                        .foregroundStyle(.white.opacity(0.85))
                }
            }
            .foregroundStyle(.white)
            .padding(24)
            .frame(maxWidth: 360)
            .background(Theme.panel, in: RoundedRectangle(cornerRadius: 24))
            .padding(24)
        }
    }

    private var summaryLine: String {
        guard let w = result.winner else {
            return "\(result.raw[0]) − \(result.raw[1]) cancels out. No points this inning."
        }
        let verb = game.names[w] == "You" ? "score" : "scores"
        return "\(result.raw[w]) − \(result.raw[1 - w]) → \(game.names[w]) \(verb) \(result.awarded)\nGame: \(game.names[0]) \(game.scores[0]), \(game.names[1]) \(game.scores[1])"
    }

    private func column(_ player: Int) -> some View {
        VStack(spacing: 6) {
            Text(game.names[player]).font(.headline)
            Text("\(result.raw[player])")
                .font(.system(size: 40, weight: .black, design: .rounded))
            Text("\(result.inHole[player]) in • \(result.onBoard[player]) on")
                .font(.caption)
                .opacity(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Theme.player[player].opacity(0.85), in: RoundedRectangle(cornerRadius: 14))
    }
}
