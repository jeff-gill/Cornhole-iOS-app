import Foundation

/// What a throw would do if executed perfectly, played out against the bags already on the board.
struct ThrowPreview: Equatable {
    var flight: [Vec3]
    var slide: [Vec2]
    var outcome: BagState
    var finalPosition: Vec2
    /// First bag the thrown bag runs into, if any.
    var hitBagID: Int?
    var hitOwner: Int?
    /// Where that bag gets pushed.
    var pushPath: [Vec2] = []
    var pushOutcome: BagState?
    var pushEnd: Vec2?

    func pushesOwnBag(of player: Int) -> Bool { hitOwner == player }
}

/// The landing zone for a finish spot: a fan behind it. Straight back needs no spin; off to the
/// side needs spin, and a longer slide has more room to hook, so the fan widens with distance.
struct AimZone: Equatable {
    var origin: Vec3
    /// Distance from the hand to the finish spot.
    var reach: Double
    /// Unit vector from the hand toward the finish spot.
    var direction: Vec2
    /// Closest and farthest landing distance (measured back from the finish) that can still finish there.
    var minDistance: Double
    var maxDistance: Double

    var back: Vec2 { -direction }

    func landing(finish: Vec2, distance: Double, angle: Double) -> Vec2 {
        finish + back.rotated(by: angle) * distance
    }

    static func maxAngle(forDistance d: Double) -> Double {
        0.85 * (Tuning.spinKick + Tuning.spinCurve * d * 0.5)
    }
}

/// A fully worked-out throw for the current markers.
struct ThrowPlan: Equatable {
    var zone: AimZone
    var finish: Vec2
    /// Landing spot as distance/angle back from the finish.
    var distance: Double
    var angle: Double
    var landing: Vec2
    var ideal: ThrowParams
    var preview: ThrowPreview
    /// Extra speed added for a push shot (0.04 = +4%), or nil.
    var pushExtra: Double?
}

enum ThrowSolver {
    static func throwFor(origin: Vec3, landing: Vec2, elevation: Double) -> ThrowParams? {
        let delta = landing - origin.xy
        let distance = delta.length
        guard distance > 1 else { return nil }
        let azimuth = atan2(delta.x, delta.y)
        let drop = origin.z - Court.surfaceHeight(at: landing)
        let c = cos(elevation)
        let denominator = 2 * c * c * (distance * tan(elevation) + drop)
        guard denominator > 0 else { return nil }
        let speed = (Court.gravity * distance * distance / denominator).squareRoot()
        return ThrowParams(origin: origin, speed: speed, elevation: elevation, azimuth: azimuth)
    }

    /// Where the bag would stop on an endless board with no hole and no other bags.
    static func freeSlideEnd(of t: ThrowParams) -> Vec2 {
        let contact = Flight.contact(for: t, ignoreHole: true)
        guard contact.kind == .board else { return contact.position.xy }
        var position = contact.position.xy
        var velocity = Physics.landingVelocity(contact.velocity, spin: t.spin)
        let curve = t.spin * Tuning.spinCurve
        var steps = 0
        while steps < 4800, Physics.slideStep(position: &position, velocity: &velocity, curve: curve, dt: Tuning.dt) {
            steps += 1
        }
        return position
    }

    // MARK: Perfect release

    /// Arc that makes the bag travel `distance` feet toward unit direction `u` after landing at `landing`.
    static func solveElevation(origin: Vec3, landing: Vec2, toward u: Vec2, distance: Double, spin: Double) -> ThrowParams? {
        func make(_ el: Double) -> ThrowParams? {
            guard var t = throwFor(origin: origin, landing: landing, elevation: el) else { return nil }
            t.spin = spin
            return t
        }
        func slide(_ el: Double) -> Double? {
            guard let t = make(el) else { return nil }
            return (freeSlideEnd(of: t) - landing).dot(u)
        }
        var lo = Tuning.minElevation // flattest: longest slide
        var hi = Tuning.maxElevation // highest: shortest slide
        guard let longest = slide(lo), let shortest = slide(hi) else { return make(Tuning.defaultElevation) }
        if distance >= longest { return make(lo) }
        if distance <= shortest { return make(hi) }
        for _ in 0..<32 {
            let mid = (lo + hi) / 2
            guard let s = slide(mid) else { break }
            if s > distance { lo = mid } else { hi = mid }
        }
        return make((lo + hi) / 2)
    }

    /// Release that lands on `landing` and finishes on `finish`: the arc sets how far it slides,
    /// spin bends the slide toward the finish.
    static func solveSpin(origin: Vec3, landing: Vec2, finish: Vec2) -> ThrowParams? {
        let d = landing.distance(to: finish)
        guard let base = throwFor(origin: origin, landing: landing, elevation: Tuning.maxElevation) else { return nil }
        if d < 0.08 { return base }
        let u = (finish - landing) / d
        let gain = Tuning.spinKick + Tuning.spinCurve * d * 0.5
        var s = (wrapAngle(u.heading - base.azimuth) / gain).clamped(-1, 1)
        for _ in 0..<6 {
            guard let t = solveElevation(origin: origin, landing: landing, toward: u, distance: d, spin: s) else { return nil }
            let err = wrapAngle(u.heading - (freeSlideEnd(of: t) - landing).heading)
            if abs(err) < 2e-4 { return t }
            s = (s + err / gain).clamped(-1, 1)
        }
        return solveElevation(origin: origin, landing: landing, toward: u, distance: d, spin: s)
    }

    // MARK: Aiming

    static func aimZone(player: Int, finish: Vec2) -> AimZone {
        let o = Court.releasePoint(forPlayer: player)
        let reach = max(1.5, finish.distance(to: o.xy))
        let dir = (finish - o.xy).normalized

        func slideAt(_ d: Double, _ el: Double) -> Double {
            let l = o.xy + dir * d
            guard let t = throwFor(origin: o, landing: l, elevation: el) else { return 0 }
            return (freeSlideEnd(of: t) - l).dot(dir)
        }

        let farthestLanding = reach - max(0, slideAt(reach, Tuning.maxElevation)) // highest arc still slides a hair
        let onBoardFrom = dir.y > 0 ? (Court.boardFrontY + 0.05 - o.y) / dir.y : reach // never plan to land on the grass
        var lo = min(onBoardFrom, farthestLanding)
        var hi = farthestLanding
        let nearestLanding: Double
        if slideAt(lo, Tuning.minElevation) >= reach - lo {
            nearestLanding = lo
        } else {
            for _ in 0..<28 {
                let m = (lo + hi) / 2
                if slideAt(m, Tuning.minElevation) >= reach - m { hi = m } else { lo = m }
            }
            nearestLanding = hi
        }
        return AimZone(
            origin: o,
            reach: reach,
            direction: dir,
            minDistance: max(0, reach - farthestLanding),
            maxDistance: max(0, reach - nearestLanding)
        )
    }

    /// Works out the perfect throw for a finish spot and a landing spot (given as distance and
    /// angle back from the finish), against the bags already on the board.
    static func plan(player: Int, finish: Vec2, distance: Double, angle: Double, board: [Bag], zone cached: AimZone? = nil) -> ThrowPlan? {
        let zone = cached ?? aimZone(player: player, finish: finish)
        var d = distance.clamped(zone.minDistance, zone.maxDistance)
        var a = angle.clamped(-AimZone.maxAngle(forDistance: d), AimZone.maxAngle(forDistance: d))
        var landing = zone.landing(finish: finish, distance: d, angle: a)
        var guardSteps = 0
        while !Court.isOnBoard(landing) && d > zone.minDistance && guardSteps < 80 { // keep the landing on the wood
            if abs(a) > 0.005 { a *= 0.85 } else { d = max(zone.minDistance, d - 0.05) }
            landing = zone.landing(finish: finish, distance: d, angle: a)
            guardSteps += 1
        }
        guard var ideal = solveSpin(origin: zone.origin, landing: landing, finish: finish) else { return nil }
        var preview = simulate(ideal, player: player, board: board)
        var extra: Double?
        if let own = preview.hitBagID, preview.pushesOwnBag(of: player), d > 0.1,
           let push = solvePush(base: ideal, landing: landing, finish: finish, player: player, board: board, ownID: own) {
            extra = push.speed / ideal.speed - 1
            ideal = push
            preview = simulate(ideal, player: player, board: board)
        }
        return ThrowPlan(zone: zone, finish: finish, distance: d, angle: a, landing: landing,
                         ideal: ideal, preview: preview, pushExtra: extra)
    }

    // MARK: Playing a throw out

    /// Plays `t` against still copies of the bags on the board, without touching the real game.
    static func simulate(_ t: ThrowParams, player: Int, board: [Bag], track: Bool = true) -> ThrowPreview {
        var world = CornholeWorld()
        world.randomizeSpin = false
        for b in board where b.isOnBoardSurface { world.addRestingCopy(of: b) }
        let myID = world.launch(t, owner: player)

        var flight: [Vec3] = [t.origin]
        var slide: [Vec2] = []
        var pushPath: [Vec2] = []
        var hit: Int?
        var steps = 0
        while !world.isSettled && steps < 6000 {
            world.step(Tuning.dt)
            steps += 1
            let events = world.drainEvents()
            if hit == nil {
                for e in events {
                    if case let .bagHit(a, o) = e {
                        if a == myID { hit = o; break }
                        if o == myID { hit = a; break }
                    }
                }
            }
            if track && (steps % 3 == 0 || world.isSettled), let me = world.bag(id: myID) {
                switch me.state {
                case .flying: flight.append(Vec3(me.position, z: me.height))
                case .sliding, .resting: slide.append(me.position)
                default: break
                }
                if let h = hit, let hb = world.bag(id: h), hb.isOnBoardSurface || pushPath.isEmpty {
                    pushPath.append(hb.position)
                }
            }
        }

        let me = world.bag(id: myID)
        if let c = me?.contact {
            flight.append(c.position)
            if !slide.isEmpty { slide.insert(c.position.xy, at: 0) }
        }
        let hitBag = hit.flatMap { world.bag(id: $0) }
        var pushEnd: Vec2?
        if let hb = hitBag {
            pushEnd = hb.state == .inHole ? Court.holeCenter : hb.position
            if hb.state == .inHole { pushPath.append(Court.holeCenter) }
        }
        return ThrowPreview(
            flight: flight,
            slide: slide,
            outcome: me?.state ?? .ground,
            finalPosition: me?.position ?? t.origin.xy,
            hitBagID: hitBag?.id,
            hitOwner: hitBag?.owner,
            pushPath: pushPath,
            pushOutcome: hitBag?.state,
            pushEnd: pushEnd
        )
    }

    /// Push shot: one of your own bags is in the way, so throw just hard enough for it to be
    /// pushed as far as the finish spot (or into the hole, if that's the target).
    static func solvePush(base: ThrowParams, landing: Vec2, finish: Vec2, player: Int, board: [Bag], ownID: Int) -> ThrowParams? {
        let d = landing.distance(to: finish)
        guard d > 0.05 else { return nil }
        let u = (finish - landing) / d
        let targetIsHole = finish.distance(to: Court.holeCenter) < Court.holeRadius

        func make(_ el: Double) -> ThrowParams? {
            guard var t = throwFor(origin: base.origin, landing: landing, elevation: el) else { return nil }
            t.spin = base.spin
            return t
        }
        func reach(_ el: Double) -> Double? {
            guard let t = make(el) else { return nil }
            let r = simulate(t, player: player, board: board, track: false)
            guard r.hitBagID == ownID, let end = r.pushEnd else { return nil }
            if targetIsHole && r.pushOutcome == .inHole { return d + 0.01 } // sunk it: that's enough
            return (end - landing).dot(u)
        }

        var lo = Tuning.minElevation // hardest push
        var hi = base.elevation
        guard let hardest = reach(lo) else { return nil }
        if hardest <= d { return make(lo) }
        for _ in 0..<22 {
            let m = (lo + hi) / 2
            if let r = reach(m), r >= d { lo = m } else { hi = m }
        }
        return make(lo)
    }
}
