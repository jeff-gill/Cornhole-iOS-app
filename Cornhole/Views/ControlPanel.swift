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
                Text(game.names[game.currentPlayer] == "You" ? "Your throw" : "\(game.names[game.currentPlayer])'s throw")
                    .font(.headline)
                    .foregroundStyle(.white)
                Spacer()
                Text("Bag \(Rules.bagsPerInning - game.bagsRemaining(for: game.currentPlayer) + 1) of \(Rules.bagsPerInning)")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
            }

            planSummary
                .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)

            HStack(spacing: 10) {
                Button {
                    game.clearMarkers()
                } label: {
                    Label("Clear", systemImage: "xmark")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.white)
                .disabled(game.finish == nil)

                Button {
                    game.stickIt()
                } label: {
                    Label("Stick it", systemImage: "pin.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.white)
                .disabled(game.finish == nil)

                Button {
                    game.beginThrow()
                } label: {
                    Text("Throw")
                        .font(.headline.weight(.heavy))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Theme.player[game.currentPlayer])
                .disabled(game.plan == nil)
            }
            .controlSize(.large)
        }
    }

    @ViewBuilder
    private var planSummary: some View {
        if let plan = game.plan {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .top, spacing: 14) {
                    stat("Arc", String(format: "%.0f°", plan.ideal.elevation.degrees))
                    stat("Slide", plan.distance < 0.15 ? "Sticks" : String(format: "%.1f ft", plan.distance))
                    stat("Spin", spinText(plan.ideal.spin))
                    if let extra = plan.pushExtra {
                        stat("Push shot", String(format: "+%.0f%% power", extra * 100), color: Theme.gold)
                    }
                    if game.showsTrajectoryPreview {
                        stat("Perfect throw", outcomeText(plan.preview))
                    }
                }
                Text("Drag the yellow ring around the gold zone: near the green spot sticks, farther back slides, off to the side adds spin.")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            Text("Tap the board where you want your bag to end up. Then drag the yellow ring to pick where it lands first.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.75))
        }
    }

    private func spinText(_ spin: Double) -> String {
        if abs(spin) < 0.05 { return "None" }
        return (spin > 0 ? "Right " : "Left ") + String(format: "%.0f%%", abs(spin) * 100)
    }

    private func outcomeText(_ preview: ThrowPreview) -> String {
        if preview.pushesOwnBag(of: game.currentPlayer), let outcome = preview.pushOutcome {
            switch outcome {
            case .inHole: return "Pushes yours in"
            case .resting, .sliding: return Court.isOnBoard(preview.pushEnd ?? .zero) ? "Pushes yours" : "Pushes yours off"
            case .ground, .flying: return "Pushes yours off"
            }
        }
        switch preview.outcome {
        case .inHole: return "Cornhole"
        case .resting, .sliding: return Court.isOnBoard(preview.finalPosition) ? "On the board" : "Off the board"
        case .ground, .flying: return "Off the board"
        }
    }

    private func stat(_ label: String, _ value: String, color: Color = .white) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.55))
            Text(value).font(.subheadline.weight(.bold).monospacedDigit()).foregroundStyle(color)
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
