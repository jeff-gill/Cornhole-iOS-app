import SwiftUI

struct GameView: View {
    let game: GameModel
    var onQuit: () -> Void

    @State private var confirmQuit = false
    @State private var showHelp = false

    var body: some View {
        VStack(spacing: 0) {
            ScoreboardView(game: game, onMenu: { confirmQuit = true }, onHelp: { showHelp = true })
            SideView(game: game)
                .frame(height: 140)
            BoardView(game: game)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Theme.grass)
                .overlay(alignment: .top) { BannerView(banner: game.banner) }
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
        .onAppear { game.start() }
        .onDisappear { game.stop() }
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
        let live = game.liveInningPoints
        HStack(spacing: 8) {
            Button(action: onMenu) {
                Image(systemName: "chevron.left").font(.headline)
            }
            .foregroundStyle(.white)
            .frame(width: 32)

            playerCard(0, live: live[0])

            VStack(spacing: 0) {
                Text("INNING").font(.system(size: 9, weight: .bold)).foregroundStyle(.white.opacity(0.6))
                Text("\(game.inning)").font(.title3.weight(.heavy).monospacedDigit()).foregroundStyle(.white)
                Text("to \(Rules.winningScore)").font(.system(size: 9, weight: .semibold)).foregroundStyle(.white.opacity(0.6))
            }
            .frame(width: 48)

            playerCard(1, live: live[1])

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
                Text(live > 0 ? "+\(live) this inning" : " ")
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
        .padding(.top, 14)
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
        guard let w = result.winner else { return "Wash – no points this inning." }
        return "\(game.names[w]) +\(result.awarded)  •  \(game.scores[0]) – \(game.scores[1])"
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
