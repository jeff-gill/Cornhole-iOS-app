import SwiftUI

struct ControlPanel: View {
    let game: GameModel

    var body: some View {
        VStack(spacing: 10) {
            switch game.phase {
            case .aiming:
                AimingControls(game: game)
            case .metering(let active):
                MeterControls(game: game, active: active)
            case .cpuThinking:
                VStack(spacing: 8) {
                    ProgressView().tint(.white)
                    Text(game.cpuPlanDescription.map { "\(game.names[game.currentPlayer]) is going for: \($0)" }
                         ?? "\(game.names[game.currentPlayer]) is lining up…")
                        .font(.headline)
                        .foregroundStyle(.white)
                }
                .frame(maxWidth: .infinity, minHeight: 150)
            case .inFlight, .inningOver, .gameOver:
                FeedbackView(items: game.lastFeedback, perfect: game.lastThrowWasPerfect)
                    .frame(maxWidth: .infinity, minHeight: 150)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(Theme.panel)
    }
}

private struct AimingControls: View {
    let game: GameModel

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Circle().fill(Theme.player[game.currentPlayer]).frame(width: 12, height: 12)
                Text("\(game.names[game.currentPlayer])'s throw")
                    .font(.headline)
                    .foregroundStyle(.white)
                Spacer()
                Text("Bag \(Rules.bagsPerInning - game.bagsRemaining(for: game.currentPlayer) + 1) of \(Rules.bagsPerInning)")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
            }

            planSummary
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)

            HStack(spacing: 10) {
                Button {
                    game.clearMarkers()
                } label: {
                    Label("Clear", systemImage: "xmark")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.white)
                .disabled(game.landingTarget == nil)

                Button {
                    game.stickIt()
                } label: {
                    Label("Stick it", systemImage: "pin.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.white)
                .disabled(game.landingTarget == nil)

                Button {
                    game.beginThrow()
                } label: {
                    Text("Throw")
                        .font(.headline.weight(.heavy))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.player[game.currentPlayer])
                .disabled(game.idealThrow == nil)
            }
            .controlSize(.large)
        }
    }

    @ViewBuilder
    private var planSummary: some View {
        if let ideal = game.idealThrow {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 14) {
                    stat("Arc", String(format: "%.0f°", ideal.elevation.degrees))
                    stat("Speed", String(format: "%.0f mph", ideal.speed * 0.6818))
                    if game.showsTrajectoryPreview, let preview = game.preview {
                        stat("Perfect throw", outcomeText(preview))
                    }
                }
                Text(game.endTarget == nil
                     ? "No finish spot: a medium arc. Tap the board to set where it should stop."
                     : "Flatter throws slide further, higher throws stick. Drag the markers to adjust.")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.6))
            }
        } else {
            Text("Tap the board to mark where your bag should hit first, then tap again for where it should stop.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.75))
        }
    }

    private func outcomeText(_ preview: ThrowPreview) -> String {
        switch preview.outcome {
        case .inHole: return "Cornhole"
        case .resting, .sliding: return Court.isOnBoard(preview.finalPosition) ? "On the board" : "Off the board"
        case .ground, .flying: return "Off the board"
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.55))
            Text(value).font(.subheadline.weight(.bold).monospacedDigit()).foregroundStyle(.white)
        }
    }
}

private struct MeterControls: View {
    let game: GameModel
    let active: MeterKind

    var body: some View {
        VStack(spacing: 10) {
            ForEach(MeterKind.allCases) { kind in
                MeterBar(
                    kind: kind,
                    value: value(for: kind),
                    state: kind == active ? .active : (kind.rawValue < active.rawValue ? .done : .waiting),
                    perfectZone: game.difficulty.perfectZone
                )
            }
            HStack {
                Button("Cancel") { game.cancelThrow() }
                    .foregroundStyle(.white.opacity(0.7))
                Spacer()
                Text("Tap anywhere to stop the \(active.title.lowercased()) needle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.8))
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { game.stopMeter() }
    }

    private func value(for kind: MeterKind) -> Double {
        if kind == active { return game.needle }
        if kind.rawValue < active.rawValue { return game.errors[kind] }
        return 0
    }
}

struct MeterBar: View {
    enum MeterState {
        case waiting
        case active
        case done
    }

    let kind: MeterKind
    let value: Double
    let state: MeterState
    let perfectZone: Double

    var body: some View {
        HStack(spacing: 10) {
            Text(kind.title)
                .font(.caption.weight(.bold))
                .foregroundStyle(.white.opacity(state == .waiting ? 0.4 : 1))
                .frame(width: 66, alignment: .leading)

            GeometryReader { geo in
                let w = geo.size.width
                let h = geo.size.height
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(LinearGradient(
                            colors: [.red, .orange, .yellow, .green, .yellow, .orange, .red],
                            startPoint: .leading,
                            endPoint: .trailing
                        ))
                        .opacity(state == .waiting ? 0.3 : 1)
                    // Perfect zone.
                    Rectangle()
                        .fill(.white.opacity(0.85))
                        .frame(width: max(3, w * perfectZone), height: h)
                        .offset(x: w / 2 - max(3, w * perfectZone) / 2)
                    if state != .waiting {
                        let x = (value.clamped(-1, 1) + 1) / 2 * w
                        RoundedRectangle(cornerRadius: 2)
                            .fill(.black)
                            .frame(width: 4, height: h + 8)
                            .overlay(RoundedRectangle(cornerRadius: 2).stroke(.white, lineWidth: 1))
                            .offset(x: x - 2)
                    }
                }
                .frame(height: h)
                .overlay(alignment: .leading) {
                    Text(kind.lowWord).font(.system(size: 9, weight: .bold)).foregroundStyle(.black.opacity(0.6)).padding(.leading, 6)
                }
                .overlay(alignment: .trailing) {
                    Text(kind.highWord).font(.system(size: 9, weight: .bold)).foregroundStyle(.black.opacity(0.6)).padding(.trailing, 6)
                }
            }
            .frame(height: 22)
        }
        .scaleEffect(state == .active ? 1.0 : 0.97)
    }
}

private struct FeedbackView: View {
    let items: [FeedbackItem]
    let perfect: Bool

    var body: some View {
        VStack(spacing: 10) {
            if items.isEmpty {
                Text(" ")
            } else {
                Text(perfect ? "Perfect release" : "Release")
                    .font(.headline)
                    .foregroundStyle(perfect ? Color.yellow : Color.white)
                HStack(spacing: 8) {
                    ForEach(items) { item in
                        VStack(spacing: 2) {
                            Text(item.kind.title.uppercased())
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.6))
                            Text(item.text)
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(item.perfect ? Color.green : Color.orange)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
        }
    }
}
