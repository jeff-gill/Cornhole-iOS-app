import SwiftUI

struct MenuView: View {
    var onStart: (GameMode, Difficulty) -> Void

    @AppStorage("mode") private var modeRaw = GameMode.vsCPU.rawValue
    @AppStorage("difficulty") private var difficultyRaw = Difficulty.medium.rawValue
    @State private var showHelp = false

    private var mode: GameMode { GameMode(rawValue: modeRaw) ?? .vsCPU }
    private var difficulty: Difficulty { Difficulty(rawValue: difficultyRaw) ?? .medium }

    var body: some View {
        ZStack {
            LinearGradient(colors: [Theme.skyTop, Theme.grass], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    header

                    VStack(alignment: .leading, spacing: 10) {
                        sectionTitle("Game")
                        Picker("Mode", selection: $modeRaw) {
                            ForEach(GameMode.allCases) { m in
                                Text(m.title).tag(m.rawValue)
                            }
                        }
                        .pickerStyle(.segmented)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        sectionTitle("Difficulty")
                        ForEach(Difficulty.allCases) { d in
                            difficultyRow(d)
                        }
                    }

                    Button {
                        onStart(mode, difficulty)
                    } label: {
                        Text("Play")
                            .font(.title2.weight(.heavy))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(Theme.player[0], in: RoundedRectangle(cornerRadius: 16))
                            .foregroundStyle(.white)
                            .shadow(radius: 6, y: 3)
                    }

                    Button("How to play") { showHelp = true }
                        .font(.headline)
                        .foregroundStyle(.white)
                }
                .padding(20)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
        }
        .sheet(isPresented: $showHelp) { HelpView() }
    }

    private var header: some View {
        VStack(spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Theme.wood)
                    .frame(width: 90, height: 150)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.woodDark, lineWidth: 4))
                Circle()
                    .fill(Theme.hole)
                    .frame(width: 34, height: 34)
                    .offset(y: -42)
                RoundedRectangle(cornerRadius: 5)
                    .fill(Theme.player[0])
                    .frame(width: 30, height: 30)
                    .rotationEffect(.degrees(18))
                    .offset(x: -14, y: 30)
                RoundedRectangle(cornerRadius: 5)
                    .fill(Theme.player[1])
                    .frame(width: 30, height: 30)
                    .rotationEffect(.degrees(-12))
                    .offset(x: 16, y: 8)
            }
            .rotation3DEffect(.degrees(35), axis: (x: 1, y: 0, z: 0))
            .padding(.top, 20)

            Text("CORNHOLE")
                .font(.system(size: 44, weight: .black, design: .rounded))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
            Text("Mark it. Meter it. Sink it.")
                .font(.headline)
                .foregroundStyle(.white.opacity(0.9))
        }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.caption.weight(.bold))
            .foregroundStyle(.white.opacity(0.85))
    }

    private func difficultyRow(_ d: Difficulty) -> some View {
        let selected = d == difficulty
        return Button {
            difficultyRaw = d.rawValue
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(d.title).font(.headline)
                    Text(d.subtitle).font(.caption).opacity(0.8)
                }
                Spacer()
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
            }
            .padding(12)
            .foregroundStyle(selected ? Color.white : Color.primary)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(selected ? Theme.player[1] : Color(.systemBackground).opacity(0.85))
            )
        }
        .buttonStyle(.plain)
    }
}

struct HelpView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Line it up") {
                    row("flag.checkered", "Tap where you want the bag to **end up** (green). Tap elsewhere to move it.")
                    row("scope", "Drag the yellow ring around the gold zone to choose where it **lands first**. Near the green spot it sticks, farther back it slides.")
                    row("arrow.turn.up.right", "Put the ring off to one side to add **spin**, so the bag kicks and hooks toward the finish.")
                    row("arrow.right.to.line", "**Push shots:** if your own bag is in the way, the game throws a bit harder so yours shoves it along your line, into the hole if that's the target.")
                }
                Section("Throw it") {
                    row("arrow.left.and.right", "**Direction** – stop the needle in the middle or the bag drifts left or right.")
                    row("bolt.fill", "**Strength** – too much and it flies long, too little and it comes up short.")
                    row("arrow.up.and.down", "**Height** – off-centre changes the arc, so it lands somewhere else and slides more or less.")
                    row("star.fill", "Only a perfect stop on all three goes exactly where you planned.")
                }
                Section("Score it") {
                    row("circle.fill", "In the hole: 3 points. On the board: 1 point.")
                    row("minus.circle", "Cancellation scoring – only the difference counts each inning.")
                    row("equal.circle", "Example: you throw 4, they throw 1, so you score 3 and they score nothing.")
                    row("trophy.fill", "First to 21 wins. Knock your opponent's bags off, or yours in!")
                }
            }
            .navigationTitle("How to play")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func row(_ icon: String, _ text: LocalizedStringKey) -> some View {
        Label {
            Text(text)
        } icon: {
            Image(systemName: icon).foregroundStyle(Theme.player[0])
        }
    }
}
