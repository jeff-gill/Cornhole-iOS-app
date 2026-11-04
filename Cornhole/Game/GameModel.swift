import Foundation
import Observation

enum GameMode: String, CaseIterable, Identifiable {
    case vsCPU
    case twoPlayer

    var id: String { rawValue }
    var title: String { self == .vsCPU ? "vs Computer" : "2 Players" }
}

enum GamePhase: Equatable {
    /// Human is placing the finish spot and the landing ring.
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
    case finish
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

/// One-off visual effects for the scene to play.
enum GameEffect {
    case landed(Vec2)
    case landedOnGrass(Vec2)
    case cornhole(player: Int)
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

    /// Where the bag should end up (green marker).
    private(set) var finish: Vec2?
    /// The worked-out throw for the current markers.
    private(set) var plan: ThrowPlan?
    /// Bumps whenever `plan` changes, so the scene knows to redraw guides.
    private(set) var planVersion = 0

    private(set) var meterTime = 0.0
    private(set) var errors = ThrowErrors()
    private(set) var lastFeedback: [FeedbackItem] = []
    private(set) var lastThrowWasPerfect = false
    private(set) var lastThrownBagID: Int?
    private(set) var cpuPlanDescription: String?

    private(set) var banner: Banner?
    private(set) var lastInning: InningResult?
    private(set) var winner: Int?

    /// Animation clocks for the scene.
    @ObservationIgnored private(set) var clock = 0.0
    @ObservationIgnored private(set) var timeSinceRelease = 99.0
    @ObservationIgnored private(set) var cpuTimer = 0.0

    @ObservationIgnored private var landDistance: Double?
    @ObservationIgnored private var landAngle = 0.0
    @ObservationIgnored private var dragging: MarkerKind?
    @ObservationIgnored private var inningLeader = 0
    @ObservationIgnored private var savedAim: [Int: (Vec2, Double, Double)] = [:]
    @ObservationIgnored private var accumulator = 0.0
    @ObservationIgnored private var settleTimer = 0.0
    @ObservationIgnored private var cpuPlan: CPUPlayer.Plan?
    @ObservationIgnored private var bannerTimer = 0.0
    @ObservationIgnored private var hitHapticCooldown = 0.0
    @ObservationIgnored private var effects: [GameEffect] = []
    @ObservationIgnored private let haptics = Haptics()

    static let defaultSlide = 1.5

    init(mode: GameMode, difficulty: Difficulty, names: [String]? = nil) {
        self.mode = mode
        self.difficulty = difficulty
        self.names = names ?? (mode == .vsCPU ? ["You", "CPU"] : ["Player 1", "Player 2"])
        beginTurn()
    }

    func restart() {
        world.clear()
        scores = [0, 0]
        inning = 1
        thrownThisInning = [0, 0]
        currentPlayer = 0
        inningLeader = 0
        savedAim = [:]
        lastInning = nil
        winner = nil
        banner = nil
        lastFeedback = []
        lastThrownBagID = nil
        timeSinceRelease = 99
        beginTurn()
    }

    // MARK: Queries

    func isCPU(_ player: Int) -> Bool { mode == .vsCPU && player == 1 }
    var isHumanTurn: Bool { !isCPU(currentPlayer) }
    var canEditMarkers: Bool { phase == .aiming && isHumanTurn }

    func bagsRemaining(for player: Int) -> Int { Rules.bagsPerInning - thrownThisInning[player] }

    var needle: Double { ThrowExecution.needle(at: meterTime, difficulty: difficulty) }

    var showsTrajectoryPreview: Bool { difficulty.showsTrajectoryPreview || !isHumanTurn }

    var landingTarget: Vec2? { plan?.landing }
    var idealThrow: ThrowParams? { plan?.ideal }
    var preview: ThrowPreview? { plan?.preview }

    /// Points for the inning so far, after cancellation.
    var liveInning: InningResult { InningResult(bags: world.bags) }

    func drainEffects() -> [GameEffect] {
        defer { effects.removeAll() }
        return effects
    }

    // MARK: Aiming (touches come from the scene, in court feet)

    func beginDrag(at p: Vec2) {
        guard canEditMarkers else { return }
        dragging = grabsLandingRing(at: p) ? .landing : .finish
        moveMarker(to: p)
    }

    func drag(to p: Vec2) {
        guard canEditMarkers, dragging != nil else { return }
        moveMarker(to: p)
    }

    func endDrag() { dragging = nil }

    private func grabsLandingRing(at p: Vec2) -> Bool {
        guard let plan, let finish else { return false }
        if p.distance(to: finish) <= 0.3 { return false }
        if p.distance(to: plan.landing) < 0.55 { return true }
        let v = p - finish
        let d = v.length
        let a = wrapAngle(v.heading - plan.zone.back.heading)
        return d >= plan.zone.minDistance - 0.25 && d <= plan.zone.maxDistance + 0.3
            && abs(a) <= AimZone.maxAngle(forDistance: d) + 0.12
    }

    private func moveMarker(to p: Vec2) {
        switch dragging {
        case .finish:
            finish = Vec2(x: p.x.clamped(-1.8, 1.8), y: p.y.clamped(Court.boardFrontY + 0.2, Court.boardBackY + 0.6))
        case .landing:
            guard let plan, let finish else { return }
            let v = p - finish
            landDistance = v.length
            landAngle = wrapAngle(v.heading - plan.zone.back.heading)
            refreshPlan(reusingZone: true) // the zone only depends on the finish spot
            return
        case nil:
            return
        }
        refreshPlan()
    }

    /// Landing on the finish spot: the highest arc, so the bag drops dead.
    func stickIt() {
        guard canEditMarkers, finish != nil else { return }
        landDistance = 0
        landAngle = 0
        refreshPlan()
    }

    func clearMarkers() {
        guard canEditMarkers else { return }
        finish = nil
        landDistance = nil
        landAngle = 0
        refreshPlan()
    }

    private func refreshPlan(reusingZone: Bool = false) {
        if let finish {
            let cached = reusingZone && plan?.finish == finish ? plan?.zone : nil
            plan = ThrowSolver.plan(
                player: currentPlayer,
                finish: finish,
                distance: landDistance ?? Self.defaultSlide,
                angle: landAngle,
                board: world.bags,
                zone: cached
            )
            if let plan {
                landDistance = plan.distance // keep what was actually achievable
                landAngle = plan.angle
            }
        } else {
            plan = nil
        }
        planVersion += 1
    }

    // MARK: Throwing

    func beginThrow() {
        guard canEditMarkers, plan != nil, let finish else { return }
        savedAim[currentPlayer] = (finish, landDistance ?? Self.defaultSlide, landAngle)
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
        guard let ideal = plan?.ideal else { return }
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
        timeSinceRelease = 0
        phase = .inFlight
        haptics.release()
        if lastThrowWasPerfect { showBanner("Perfect release!", player: currentPlayer) }
    }

    // MARK: Turn flow

    private func beginTurn() {
        cpuPlan = nil
        cpuPlanDescription = nil
        dragging = nil
        if isCPU(currentPlayer) {
            finish = nil
            plan = nil
            planVersion += 1
            cpuTimer = 0
            phase = .cpuThinking
        } else {
            let saved = savedAim[currentPlayer]
            finish = saved?.0
            landDistance = saved?.1
            landAngle = saved?.2 ?? 0
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

    // MARK: Frame loop (driven by the SpriteKit scene)

    func tick(_ dt: Double) {
        clock += dt
        timeSinceRelease += dt
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
            let p = CPUPlayer.plan(for: currentPlayer, bags: world.bags)
            cpuPlan = p
            cpuPlanDescription = p.description
            let end = p.end ?? p.landing
            finish = end
            landDistance = p.landing.distance(to: end)
            landAngle = 0
            refreshPlan()
        }
        if cpuTimer > 2.0 {
            if plan != nil {
                release(with: CPUPlayer.errors(difficulty: difficulty))
            } else {
                // Couldn't plan anything sensible: just lob it at the hole.
                finish = Court.holeCenter
                landDistance = 0
                refreshPlan()
                if plan == nil { cpuTimer = 0 }
            }
        }
    }

    private func handle(_ events: [WorldEvent]) {
        for event in events {
            switch event {
            case .swish(let id):
                let who = owner(of: id) ?? currentPlayer
                showBanner("SWISH! Cornhole!", player: who)
                effects.append(.cornhole(player: who))
                haptics.success()
            case .droppedInHole(let id):
                let who = owner(of: id) ?? currentPlayer
                showBanner(id == lastThrownBagID ? "CORNHOLE!" : "Knocked in!", player: who)
                effects.append(.cornhole(player: who))
                haptics.success()
            case .landedOnBoard(let id):
                if let b = world.bag(id: id) { effects.append(.landed(b.position)) }
                haptics.thud()
            case .landedOnGround(let id):
                if let b = world.bag(id: id) { effects.append(.landedOnGrass(b.position)) }
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
        world.bag(id: id)?.owner
    }

    private func showBanner(_ text: String, player: Int?) {
        banner = Banner(text: text, player: player)
        bannerTimer = 1.6
    }
}
