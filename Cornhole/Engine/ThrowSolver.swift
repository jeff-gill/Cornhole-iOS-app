import Foundation

/// Works out the "perfect" throw for a marked landing spot (where the bag should hit
/// first) and an optional finish spot (where it should come to rest).
///
/// The landing spot fixes direction and, for a given arc, the strength. The finish spot
/// picks the arc: flatter throws come in fast and slide a long way, high throws drop
/// in steep and stick.
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
    /// Used only to pick the arc, so it must be smooth in the elevation.
    static func freeSlideEnd(of t: ThrowParams) -> Vec2 {
        let contact = Flight.contact(for: t, ignoreHole: true)
        guard contact.kind == .board else { return contact.position.xy }
        var position = contact.position.xy
        var velocity = Physics.landingVelocity(contact.velocity)
        var steps = 0
        while steps < 4800, Physics.slideStep(position: &position, velocity: &velocity, dt: Tuning.dt) {
            steps += 1
        }
        return position
    }

    static func solve(origin: Vec3, landing: Vec2, desiredEnd: Vec2?) -> ThrowParams? {
        guard let end = desiredEnd else {
            return throwFor(origin: origin, landing: landing, elevation: Tuning.defaultElevation)
        }
        let direction = (landing - origin.xy).normalized
        let desiredSlide = max(0, (end - landing).dot(direction))

        func slide(_ elevation: Double) -> Double? {
            guard let t = throwFor(origin: origin, landing: landing, elevation: elevation) else { return nil }
            return (freeSlideEnd(of: t) - landing).dot(direction)
        }

        var lo = Tuning.minElevation // flattest: longest slide
        var hi = Tuning.maxElevation // highest: shortest slide
        guard let longest = slide(lo), let shortest = slide(hi) else {
            return throwFor(origin: origin, landing: landing, elevation: Tuning.defaultElevation)
        }
        if desiredSlide >= longest { return throwFor(origin: origin, landing: landing, elevation: lo) }
        if desiredSlide <= shortest { return throwFor(origin: origin, landing: landing, elevation: hi) }

        for _ in 0..<32 {
            let mid = (lo + hi) / 2
            guard let s = slide(mid) else { break }
            if s > desiredSlide { lo = mid } else { hi = mid }
        }
        return throwFor(origin: origin, landing: landing, elevation: (lo + hi) / 2)
    }

    /// What a perfect execution of `t` would do on an empty board.
    static func preview(of t: ThrowParams) -> ThrowPreview {
        var world = CornholeWorld()
        world.randomizeSpin = false
        world.launch(t, owner: 0)
        var flight: [Vec3] = [t.origin]
        var slide: [Vec2] = []
        var steps = 0
        while !world.isSettled && steps < 6000 {
            world.step(Tuning.dt)
            steps += 1
            guard let bag = world.bags.first else { break }
            if steps % 3 == 0 || world.isSettled {
                switch bag.state {
                case .flying: flight.append(Vec3(bag.position, z: bag.height))
                case .sliding, .resting: slide.append(bag.position)
                default: break
                }
            }
        }
        let bag = world.bags.first
        if let c = bag?.contact { flight.append(c.position) }
        if let first = slide.first, let landing = bag?.contact?.position.xy, first != landing {
            slide.insert(landing, at: 0)
        }
        return ThrowPreview(
            flight: flight,
            slide: slide,
            outcome: bag?.state ?? .ground,
            finalPosition: bag?.position ?? t.origin.xy
        )
    }
}

struct ThrowPreview: Equatable {
    var flight: [Vec3]
    var slide: [Vec2]
    var outcome: BagState
    var finalPosition: Vec2
}
