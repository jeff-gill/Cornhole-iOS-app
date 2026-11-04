import Foundation
import Observation

enum GameMode: String, CaseIterable, Identifiable {
    case vsCPU
    case twoPlayer

    var id: String { rawValue }
    var title: String { self == .vsCPU ? "vs Computer" : "2 Players" }
}

enum GamePhase: Equatable {
    /// Human is marking where the bag should land / finish.
    case aiming
    /// Human is stopping the skill meters one at a time.
    case metering(MeterKind)
    /// Computer opponent is lining up.
    case cpuThinking
    /// A bag is in the air or bags are still sliding.
    case inFlight
    case inningOver
    case gameOver
}

enum MarkerKind {
    case landing
    case end
}

struct FeedbackItem: Identifiable, Equatable {
    var kind: MeterKind
    var text: String
    var perfect: Bool
    var id: Int { kind.rawValue }
}

struct Banner: Equatable {
    var text: String
    var player: Int?
    var id = UUID()
}

@Observable
final class GameModel {
    let mode: GameMode
    let difficulty: Difficulty
    let names: [String]

    private(set) var world = CornholeWorld()
    private(set) var scores = [0, 0]
    private(set) var inning = 1
    private(set) var thrownThisInning = [0, 0]
    private(set) var currentPlayer = 0
    private(set) var phase: GamePhase = .aiming

    private(set) var landingTarget: Vec2?
    private(set) var endTarget: Vec2?
    private(set) var idealThrow: ThrowParams?
    private(set) var preview: ThrowPreview?

    private(set) var meterTime = 0.0
    private(set) var errors = ThrowErrors()
    private(set) var lastFeedback: [FeedbackItem] = []
    private(set) var lastThrowWasPerfect = false
    private(set) var lastThrownBagID: Int?
    private(set) var cpuPlanDescription: String?

    private(set) var banner: Banner?
    private(set) var lastInning: InningResult?
    private(set) var winner: Int?

    @ObservationIgnored private var inningLeader = 0
    @ObservationIgnored private var savedMarkers: [Int: (Vec2, Vec2?)] = [:]
    @ObservationIgnored private var accumulator = 0.0
    @ObservationIgnored private var settleTimer = 0.0
    @ObservationIgnored private var cpuTimer = 0.0
    @ObservationIgnored private var cpuPlan: CPUPlayer.Plan?
    @ObservationIgnored private var bannerTimer = 0.0
    @ObservationIgnored private var hitHapticCooldown = 0.0
    @ObservationIgnored private let driver = DisplayLinkDriver()
    @ObservationIgnored private let haptics = Haptics()

    init(mode: GameMode, difficulty: Difficulty, names: [String]? = nil) {
        self.mode = mode
        self.difficulty = difficulty
        self.names = names ?? (mode == .vsCPU ? ["You", "CPU"] : ["Player 1", "Player 2"])
        driver.onFrame = { [weak self] dt in self?.tick(dt) }
        beginTurn()
    }

    // MARK: Lifecycle

    func start() { driver.start() }
    func stop() { driver.stop() }

    func restart() {
        world.clear()
        scores = [0, 0]
        inning = 1
        thrownThisInning = [0, 0]
        currentPlayer = 0
        inningLeader = 0
        savedMarkers = [:]
        lastInning = nil
        winner = nil
        banner = nil
        lastFeedback = []
        beginTurn()
    }

    // MARK: Queries

    func isCPU(_ player: Int) -> Bool { mode == .vsCPU && player == 1 }
    var isHumanTurn: Bool { !isCPU(currentPlayer) }
    var canEditMarkers: Bool { phase == .aiming && isHumanTurn }

    func bagsRemaining(for player: Int) -> Int { Rules.bagsPerInning - thrownThisInning[player] }

    var needle: Double { ThrowExecution.needle(at: meterTime, difficulty: difficulty) }

    var showsTrajectoryPreview: Bool {
        difficulty.showsTrajectoryPreview || !isHumanTurn
    }

    var liveInningPoints: [Int] { InningResult(bags: world.bags).raw }

    // MARK: Aiming

    func setMarker(_ kind: MarkerKind, at point: Vec2) {
        guard canEditMarkers else { return }
        let p = Vec2(x: point.x.clamped(-2.0, 2.0), y: point.y.clamped(Court.boardFrontY - 1.0, Court.boardBackY + 1.0))
        switch kind {
        case .landing: landingTarget = p
        case .end: endTarget = p
        }
        refreshPlan()
    }

    /// Finish spot = landing spot: the solver picks the highest arc so the bag drops dead.
    func stickIt() {
        guard canEditMarkers, let landing = landingTarget else { return }
        endTarget = landing
        refreshPlan()
    }

    func clearMarkers() {
        guard canEditMarkers else { return }
        landingTarget = nil
        endTarget = nil
        refreshPlan()
    }

    private func refreshPlan() {
        guard let landing = landingTarget else {
            idealThrow = nil
            preview = nil
            return
        }
        let origin = Court.releasePoint(forPlayer: currentPlayer)
        idealThrow = ThrowSolver.solve(origin: origin, landing: landing, desiredEnd: endTarget)
        preview = idealThrow.map { ThrowSolver.preview(of: $0) }
    }

    // MARK: Throwing

    func beginThrow() {
        guard canEditMarkers, idealThrow != nil else { return }
        savedMarkers[currentPlayer] = landingTarget.map { ($0, endTarget) }
        errors = ThrowErrors()
        meterTime = 0
        phase = .metering(.direction)
        haptics.tap()
    }

    func stopMeter() {
        guard case .metering(let kind) = phase else { return }
        errors[kind] = needle
        haptics.tap()
        if let next = MeterKind(rawValue: kind.rawValue + 1) {
            meterTime = 0
            phase = .metering(next)
        } else {
            release(with: errors)
        }
    }

    func cancelThrow() {
        guard case .metering = phase else { return }
        phase = .aiming
    }

    private func release(with errors: ThrowErrors) {
        guard let ideal = idealThrow else { return }
        let actual = ThrowExecution.apply(errors, to: ideal, difficulty: difficulty)
        lastFeedback = MeterKind.allCases.map { kind in
            let grade = ThrowExecution.grade(errors[kind], kind: kind, difficulty: difficulty)
            return FeedbackItem(kind: kind, text: grade, perfect: grade == "Perfect")
        }
        lastThrowWasPerfect = ThrowExecution.isPerfect(errors, difficulty: difficulty)
        lastThrownBagID = world.launch(actual, owner: currentPlayer)
        thrownThisInning[currentPlayer] += 1
        settleTimer = 0
        accumulator = 0
        phase = .inFlight
        haptics.release()
        if lastThrowWasPerfect { showBanner("Perfect release!", player: currentPlayer) }
    }

    // MARK: Turn flow

    private func beginTurn() {
        cpuPlan = nil
        cpuPlanDescription = nil
        if isCPU(currentPlayer) {
            landingTarget = nil
            endTarget = nil
            idealThrow = nil
            preview = nil
            cpuTimer = 0
            phase = .cpuThinking
        } else {
            let saved = savedMarkers[currentPlayer]
            landingTarget = saved?.0
            endTarget = saved?.1
            phase = .aiming
            refreshPlan()
        }
    }

    private func endTurn() {
        if thrownThisInning[0] >= Rules.bagsPerInning && thrownThisInning[1] >= Rules.bagsPerInning {
            finishInning()
            return
        }
        let other = 1 - currentPlayer
        if thrownThisInning[other] < Rules.bagsPerInning {
            currentPlayer = other
        }
        beginTurn()
    }

    private func finishInning() {
        let result = InningResult(bags: world.bags)
        lastInning = result
        if let w = result.winner {
            scores[w] += result.awarded
            inningLeader = w
        }
        if let best = scores.indices.max(by: { scores[$0] < scores[$1] }), scores[best] >= Rules.winningScore {
            winner = best
            phase = .gameOver
            haptics.success()
        } else {
            phase = .inningOver
        }
    }

    func nextInning() {
        guard phase == .inningOver else { return }
        world.clear()
        inning += 1
        thrownThisInning = [0, 0]
        currentPlayer = inningLeader
        lastFeedback = []
        beginTurn()
    }

    // MARK: Frame loop

    private func tick(_ dt: Double) {
        hitHapticCooldown = max(0, hitHapticCooldown - dt)
        if banner != nil {
            bannerTimer -= dt
            if bannerTimer <= 0 { banner = nil }
        }

        switch phase {
        case .metering:
            meterTime += dt
        case .cpuThinking:
            tickCPU(dt)
        case .inFlight:
            accumulator += dt
            var w = world
            while accumulator >= Tuning.dt {
                w.step(Tuning.dt)
                accumulator -= Tuning.dt
            }
            let events = w.drainEvents()
            world = w
            handle(events)
            if world.isSettled {
                settleTimer += dt
                if settleTimer > 1.0 { endTurn() }
            }
        default:
            break
        }
    }

    private func tickCPU(_ dt: Double) {
        cpuTimer += dt
        if cpuPlan == nil && cpuTimer > 0.7 {
            let plan = CPUPlayer.plan(for: currentPlayer, bags: world.bags)
            cpuPlan = plan
            cpuPlanDescription = plan.description
            landingTarget = plan.landing
            endTarget = plan.end
            refreshPlan()
        }
        if cpuTimer > 2.0 {
            release(with: CPUPlayer.errors(difficulty: difficulty))
        }
    }

    private func handle(_ events: [WorldEvent]) {
        for event in events {
            switch event {
            case .swish(let id):
                showBanner("SWISH! Cornhole!", player: owner(of: id))
                haptics.success()
            case .droppedInHole(let id):
                let text = id == lastThrownBagID ? "CORNHOLE!" : "Knocked in!"
                showBanner(text, player: owner(of: id))
                haptics.success()
            case .landedOnBoard:
                haptics.thud()
            case .landedOnGround(let id):
                if id == lastThrownBagID { showBanner("Off the board", player: owner(of: id)) }
                haptics.light()
            case .bagHit:
                if hitHapticCooldown == 0 {
                    haptics.thud()
                    hitHapticCooldown = 0.15
                }
            case .fellOff(let id):
                showBanner(id == lastThrownBagID ? "Slid off" : "Knocked off!", player: owner(of: id))
                haptics.light()
            }
        }
    }

    private func owner(of id: Int) -> Int? {
        world.bags.first { $0.id == id }?.owner
    }

    private func showBanner(_ text: String, player: Int?) {
        banner = Banner(text: text, player: player)
        bannerTimer = 1.6
    }
}
