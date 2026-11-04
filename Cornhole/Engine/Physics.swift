import Foundation

// MARK: - Throw

/// Everything needed to describe a release. Flight is a pure ballistic arc, so the
/// position at any time is exact; this keeps the "perfect throw" prediction and the
/// real simulation identical.
struct ThrowParams: Equatable {
    var origin: Vec3
    /// Release speed, ft/s ("strength").
    var speed: Double
    /// Release angle above horizontal, radians ("height of throw").
    var elevation: Double
    /// Heading in radians. 0 is straight down-range, positive is to the right ("direction").
    var azimuth: Double

    var initialVelocity: Vec3 {
        let horizontal = speed * cos(elevation)
        return Vec3(x: horizontal * sin(azimuth), y: horizontal * cos(azimuth), z: speed * sin(elevation))
    }

    func position(at t: Double) -> Vec3 {
        let v = initialVelocity
        return Vec3(
            x: origin.x + v.x * t,
            y: origin.y + v.y * t,
            z: origin.z + v.z * t - 0.5 * Court.gravity * t * t
        )
    }

    func velocity(at t: Double) -> Vec3 {
        let v = initialVelocity
        return Vec3(x: v.x, y: v.y, z: v.z - Court.gravity * t)
    }
}

enum ContactKind: Equatable {
    case board
    case hole
    case ground
}

struct FlightContact: Equatable {
    var time: Double
    var position: Vec3
    var velocity: Vec3
    var kind: ContactKind
}

enum Flight {
    /// Finds where a throw first touches the board, drops through the hole, or hits the ground.
    static func contact(for t: ThrowParams, ignoreHole: Bool = false) -> FlightContact {
        func clearance(_ time: Double) -> Double {
            let p = t.position(at: time)
            return p.z - Court.surfaceHeight(at: p.xy)
        }

        let step = Tuning.dt
        var previous = 0.0
        var time = step
        while time < 12 {
            if clearance(time) <= 0 {
                var lo = previous
                var hi = time
                for _ in 0..<48 {
                    let mid = (lo + hi) / 2
                    if clearance(mid) > 0 { lo = mid } else { hi = mid }
                }
                return classify(t, time: hi, ignoreHole: ignoreHole)
            }
            previous = time
            time += step
        }
        return classify(t, time: time, ignoreHole: ignoreHole)
    }

    private static func classify(_ t: ThrowParams, time: Double, ignoreHole: Bool) -> FlightContact {
        var p = t.position(at: time)
        let v = t.velocity(at: time)
        let onTop = Court.isOnBoard(p.xy) && p.z >= Court.boardPlaneHeight(atY: p.y) - 0.03

        if onTop {
            p.z = Court.boardPlaneHeight(atY: p.y)
            if !ignoreHole && Court.isOverHole(p.xy) {
                return FlightContact(time: time, position: p, velocity: v, kind: .hole)
            }
            return FlightContact(time: time, position: p, velocity: v, kind: .board)
        }

        // Hit the ground, or clipped the front/side face of the board and dropped in front of it.
        var ground = p.xy
        if Court.isOnBoard(ground) {
            let toFront = ground.y - Court.boardFrontY
            let toSide = Court.boardHalfWidth - abs(ground.x)
            if toFront <= toSide {
                ground.y = Court.boardFrontY - Court.bagRadius
            } else {
                ground.x = (ground.x < 0 ? -1 : 1) * (Court.boardHalfWidth + Court.bagRadius)
            }
        }
        return FlightContact(time: time, position: Vec3(ground, z: 0), velocity: v, kind: .ground)
    }
}

// MARK: - Sliding

enum Physics {
    /// Converts the 3D impact velocity into the along-board velocity the bag keeps.
    /// Steep (high-arc) landings stick; flat landings slide.
    static func landingVelocity(_ v: Vec3) -> Vec2 {
        let normal = Vec3(x: 0, y: -Court.slopeSin, z: Court.slopeCos)
        let vn = v.dot(normal) // negative: moving into the board
        let speed = max(v.length, 1e-6)
        let steepness = (-vn / speed).clamped(0, 1)
        let tangential = v - normal * vn
        let retention = max(0, Tuning.landingRetentionBase - Tuning.landingRetentionSteepness * steepness)
        return tangential.xy * retention
    }

    /// Advances one sliding bag on the sloped board. Returns false once it has stopped.
    @discardableResult
    static func slideStep(position: inout Vec2, velocity: inout Vec2, dt: Double) -> Bool {
        let speed = velocity.length
        if speed < Tuning.stopSpeed {
            velocity = .zero
            return false
        }
        let g = Court.gravity
        let friction = velocity.normalized * (-Tuning.friction * g * Court.slopeCos)
        let downhill = Vec2(x: 0, y: -g * Court.slopeSin * Court.slopeCos)
        let newVelocity = velocity + (friction + downhill) * dt
        if newVelocity.dot(velocity) <= 0 {
            velocity = .zero
            return false
        }
        velocity = newVelocity
        position += velocity * dt
        return true
    }
}

// MARK: - Bags & world

enum BagState: Equatable {
    case flying
    case sliding
    case resting
    case inHole
    case ground
}

struct Bag: Identifiable, Equatable {
    let id: Int
    let owner: Int
    var state: BagState
    var position: Vec2
    var height: Double
    var velocity: Vec2 = .zero
    var angle: Double = 0
    var spin: Double = 0
    var throwParams: ThrowParams?
    var flightTime: Double = 0
    var contact: FlightContact?
    var trail: [Vec3] = []

    var isOnBoardSurface: Bool { state == .sliding || state == .resting }

    var points: Int {
        switch state {
        case .inHole: return 3
        case .resting, .sliding: return Court.isOnBoard(position) ? 1 : 0
        case .flying, .ground: return 0
        }
    }
}

enum WorldEvent: Equatable {
    case landedOnBoard(bag: Int)
    case landedOnGround(bag: Int)
    case swish(bag: Int)
    case droppedInHole(bag: Int)
    case bagHit(bag: Int, other: Int)
    case fellOff(bag: Int)
}

struct CornholeWorld {
    private(set) var bags: [Bag] = []
    private(set) var events: [WorldEvent] = []
    private var nextID = 0
    /// Set false for prediction runs so the result is deterministic.
    var randomizeSpin = true

    var isSettled: Bool {
        bags.allSatisfy { $0.state != .flying && $0.state != .sliding }
    }

    mutating func clear() {
        bags.removeAll()
        events.removeAll()
    }

    mutating func drainEvents() -> [WorldEvent] {
        defer { events.removeAll() }
        return events
    }

    @discardableResult
    mutating func launch(_ t: ThrowParams, owner: Int) -> Int {
        let id = nextID
        nextID += 1
        var bag = Bag(id: id, owner: owner, state: .flying, position: t.origin.xy, height: t.origin.z)
        bag.throwParams = t
        bag.contact = Flight.contact(for: t)
        bag.angle = t.azimuth
        bag.spin = randomizeSpin ? Double.random(in: -4...4) : 2
        bag.trail = [t.origin]
        bags.append(bag)
        return id
    }

    mutating func step(_ dt: Double) {
        for i in bags.indices {
            switch bags[i].state {
            case .flying: stepFlight(i, dt)
            case .sliding: stepSlide(i, dt)
            default: break
            }
        }
        resolveCollisions()
    }

    // MARK: Flight

    private mutating func stepFlight(_ i: Int, _ dt: Double) {
        var b = bags[i]
        guard let t = b.throwParams, let c = b.contact else { return }
        b.flightTime += dt
        b.angle += b.spin * dt

        if b.flightTime >= c.time {
            land(&b, at: c)
            bags[i] = b
            return
        }

        let p = t.position(at: b.flightTime)
        b.position = p.xy
        b.height = p.z
        if Int(b.flightTime / dt) % 2 == 0 { b.trail.append(p) }

        // Skimming low over the board straight into another bag: it lands right there.
        if Court.isOnBoard(p.xy), p.z - Court.boardPlaneHeight(atY: p.y) < 0.18 {
            let me = b.id
            if let other = bags.first(where: {
                $0.id != me && $0.isOnBoardSurface && $0.position.distance(to: p.xy) < Court.bagSize * 0.9
            }) {
                let early = FlightContact(
                    time: b.flightTime,
                    position: Vec3(p.xy, z: Court.boardPlaneHeight(atY: p.y)),
                    velocity: t.velocity(at: b.flightTime),
                    kind: .board
                )
                land(&b, at: early)
                events.append(.bagHit(bag: b.id, other: other.id))
            }
        }
        bags[i] = b
    }

    private mutating func land(_ b: inout Bag, at c: FlightContact) {
        b.position = c.position.xy
        b.height = c.position.z
        b.trail.append(c.position)
        switch c.kind {
        case .hole:
            b.state = .inHole
            b.velocity = .zero
            events.append(.swish(bag: b.id))
        case .ground:
            b.state = .ground
            b.height = 0
            b.velocity = .zero
            b.spin = 0
            events.append(.landedOnGround(bag: b.id))
        case .board:
            b.state = .sliding
            b.velocity = Physics.landingVelocity(c.velocity)
            b.spin *= 0.6
            events.append(.landedOnBoard(bag: b.id))
            checkBoardBounds(&b)
        }
    }

    // MARK: Sliding

    private mutating func stepSlide(_ i: Int, _ dt: Double) {
        var b = bags[i]
        let moving = Physics.slideStep(position: &b.position, velocity: &b.velocity, dt: dt)
        b.height = Court.boardPlaneHeight(atY: b.position.y)
        b.angle += b.spin * dt
        b.spin *= max(0, 1 - 2.5 * dt)
        if !moving {
            b.state = .resting
            b.spin = 0
        }
        checkBoardBounds(&b)
        bags[i] = b
    }

    private mutating func checkBoardBounds(_ b: inout Bag) {
        guard b.isOnBoardSurface else { return }
        if Court.isOverHole(b.position, within: Tuning.holeCaptureRadius) {
            b.state = .inHole
            b.velocity = .zero
            b.spin = 0
            events.append(.droppedInHole(bag: b.id))
        } else if !Court.isOnBoard(b.position) {
            // Slid off an edge and dropped to the ground just beyond it.
            var p = b.position
            if p.y > Court.boardBackY { p.y += Court.bagRadius }
            if p.y < Court.boardFrontY { p.y -= Court.bagRadius }
            if abs(p.x) > Court.boardHalfWidth { p.x += (p.x < 0 ? -1 : 1) * Court.bagRadius }
            b.position = p
            b.state = .ground
            b.height = 0
            b.velocity = .zero
            b.spin = 0
            events.append(.fellOff(bag: b.id))
        }
    }

    // MARK: Bag-on-bag

    private mutating func resolveCollisions() {
        let active = bags.indices.filter { bags[$0].isOnBoardSurface }
        guard active.count > 1 else { return }
        let minDistance = 2 * Court.bagRadius

        for a in 0..<active.count {
            for c in (a + 1)..<active.count {
                let i = active[a]
                let j = active[c]
                guard bags[i].isOnBoardSurface, bags[j].isOnBoardSurface else { continue }

                var delta = bags[j].position - bags[i].position
                var distance = delta.length
                guard distance < minDistance else { continue }
                if distance < 1e-6 {
                    delta = Vec2(x: 0.01, y: 0)
                    distance = 0.01
                }
                let n = delta / distance
                let closing = (bags[j].velocity - bags[i].velocity).dot(n)
                if closing < 0 {
                    let impulse = -(1 + Tuning.restitution) * closing / 2
                    bags[i].velocity -= n * impulse
                    bags[j].velocity += n * impulse
                    if closing < -0.5 {
                        let twist = randomizeSpin ? Double.random(in: -3...3) : 1.5
                        bags[i].spin += twist
                        bags[j].spin -= twist
                        events.append(.bagHit(bag: bags[i].id, other: bags[j].id))
                    }
                }
                let push = (minDistance - distance) / 2
                bags[i].position -= n * push
                bags[j].position += n * push

                for k in [i, j] {
                    if bags[k].velocity.length > Tuning.stopSpeed { bags[k].state = .sliding }
                    var bag = bags[k]
                    checkBoardBounds(&bag)
                    bags[k] = bag
                }
            }
        }
    }
}
