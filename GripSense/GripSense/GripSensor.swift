import Foundation
import CoreHaptics
import CoreMotion

/// Vibrates the phone continuously with the Taptic Engine and measures how much of that
/// vibration the motion sensors pick up. Squeezing the phone damps the vibration, so the
/// measured vibration energy drops as grip force rises (the "GripSense" idea, Goel et al., UIST 2012).
final class GripSensor: ObservableObject {
    enum Channel: String, CaseIterable, Identifiable {
        case accel = "Accel", gyro = "Gyro"
        var id: String { rawValue }
    }

    // Live readings
    @Published var accelRMS: Double = 0
    @Published var gyroRMS: Double = 0
    @Published var history: [Double] = []          // recent RMS of the selected channel
    @Published var grip: Double? = nil             // 0 = loose, 1 = full squeeze (after calibration)

    // Settings
    @Published var channel: Channel = .accel { didSet { history.removeAll() } }
    @Published var vibrating = false
    @Published var intensity: Float = 1.0 { didSet { updateIntensity() } }
    @Published var sharpness: Float = 0.5 { didSet { updateIntensity() } }
    /// Pulsed: vibration switches on/off at `pulseHz`, and we only measure the part of the
    /// sensor energy that follows that rhythm (lock-in detection), which rejects hand motion.
    @Published var pulsed = true { didSet { history.removeAll(); resetCalibration(); if vibrating { startVibration() } } }
    @Published var signalLevel: Double = 0          // what the grip estimate is computed from

    // Calibration
    @Published var looseLevel: Double?
    @Published var squeezeLevel: Double?
    @Published var calibrating: String?            // "loose" / "squeeze" while sampling
    @Published var status = ""

    private let motion = CMMotionManager()
    private var engine: CHHapticEngine?
    private var player: CHHapticAdvancedPatternPlayer?

    private let rate = 100.0                       // Hz, the iPhone max for raw sensors
    private let window = 40                        // samples per RMS window (0.4 s)
    private let historyLength = 300
    private var accelMean = SIMD3<Double>(repeating: 0)
    private var gyroMean = SIMD3<Double>(repeating: 0)
    private var accelEnergy: [Double] = []
    private var gyroEnergy: [Double] = []
    private var calibrationSamples: [Double] = []
    private let pulseHz = 5.0
    private let lockInSeconds = 1.0
    private var lockIn: [(t: Double, e: Double)] = []

    // MARK: - Lifecycle

    func start() {
        startMotion()
        setUpHaptics()
    }

    func stop() {
        motion.stopAccelerometerUpdates()
        motion.stopGyroUpdates()
        try? player?.stop(atTime: CHHapticTimeImmediate)
        engine?.stop()
    }

    // MARK: - Motion

    private func startMotion() {
        guard motion.isAccelerometerAvailable, motion.isGyroAvailable else {
            status = "Motion sensors unavailable (are you on the simulator?)"
            return
        }
        motion.accelerometerUpdateInterval = 1 / rate
        motion.gyroUpdateInterval = 1 / rate
        motion.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
            guard let self, let a = data?.acceleration else { return }
            self.ingest(SIMD3(a.x, a.y, a.z), t: data!.timestamp, mean: &self.accelMean, energy: &self.accelEnergy, isAccel: true)
        }
        motion.startGyroUpdates(to: .main) { [weak self] data, _ in
            guard let self, let r = data?.rotationRate else { return }
            self.ingest(SIMD3(r.x, r.y, r.z), t: data!.timestamp, mean: &self.gyroMean, energy: &self.gyroEnergy, isAccel: false)
        }
    }

    /// High-pass each axis (subtract a slow running mean, removing gravity and hand drift),
    /// then keep a sliding window of squared magnitude to get vibration RMS.
    private func ingest(_ v: SIMD3<Double>, t: Double, mean: inout SIMD3<Double>, energy: inout [Double], isAccel: Bool) {
        mean += (v - mean) * 0.05
        let d = v - mean
        let e = (d * d).sum()
        energy.append(e)
        if energy.count > window { energy.removeFirst(energy.count - window) }
        let rms = (energy.reduce(0, +) / Double(energy.count)).squareRoot()

        if isAccel { accelRMS = rms } else { gyroRMS = rms }
        guard (isAccel && channel == .accel) || (!isAccel && channel == .gyro) else { return }

        let level = pulsed ? lockInLevel(t: t, e: e) : rms
        signalLevel = level
        history.append(level)
        if history.count > historyLength { history.removeFirst(history.count - historyLength) }
        if calibrating != nil { calibrationSamples.append(level) }
        updateGrip(level)
    }

    /// Amplitude of the energy signal at exactly the pulse frequency (phase-independent),
    /// i.e. how much vibration energy appears when the motor is on vs off.
    private func lockInLevel(t: Double, e: Double) -> Double {
        lockIn.append((t, e))
        while let first = lockIn.first, t - first.t > lockInSeconds { lockIn.removeFirst() }
        guard lockIn.count > 10 else { return 0 }
        var i = 0.0, q = 0.0, meanE = 0.0
        for s in lockIn { meanE += s.e }
        meanE /= Double(lockIn.count)
        for s in lockIn {
            let ph = 2 * Double.pi * pulseHz * s.t
            i += (s.e - meanE) * cos(ph); q += (s.e - meanE) * sin(ph)
        }
        return (2 * (i * i + q * q).squareRoot() / Double(lockIn.count)).squareRoot()
    }

    private func updateGrip(_ rms: Double) {
        guard let loose = looseLevel, let squeeze = squeezeLevel, loose > squeeze else { grip = nil; return }
        grip = min(max((loose - rms) / (loose - squeeze), 0), 1)
    }

    // MARK: - Calibration

    func calibrate(_ which: String) {
        guard vibrating else { status = "Turn vibration on first"; return }
        calibrationSamples.removeAll()
        calibrating = which
        status = which == "loose" ? "Hold the phone lightly…" : "Squeeze as hard as you can…"
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
            guard let self else { return }
            // Drop the first 0.5 s while the window settles, then take the median.
            let s = Array(self.calibrationSamples.dropFirst(Int(self.rate / 2))).sorted()
            let median = s.isEmpty ? nil : s[s.count / 2]
            if which == "loose" { self.looseLevel = median } else { self.squeezeLevel = median }
            self.calibrating = nil
            if let l = self.looseLevel, let q = self.squeezeLevel {
                let drop = (1 - q / l) * 100
                self.status = l > q
                    ? String(format: "Calibrated. Squeezing damps vibration by %.0f%%", drop)
                    : "Squeeze didn't lower vibration. Try the other channel or grip differently."
            } else {
                self.status = "Now calibrate the other one"
            }
        }
    }

    func resetCalibration() {
        looseLevel = nil; squeezeLevel = nil; grip = nil; status = ""
    }

    // MARK: - Haptics

    private func setUpHaptics() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
            status = "This device has no haptics"
            return
        }
        do {
            let engine = try CHHapticEngine()
            engine.playsHapticsOnly = true
            engine.isAutoShutdownEnabled = false
            engine.resetHandler = { [weak self] in
                try? self?.engine?.start()
                if self?.vibrating == true { self?.startVibration() }
            }
            engine.stoppedHandler = { [weak self] _ in
                DispatchQueue.main.async { self?.vibrating = false }
            }
            try engine.start()
            self.engine = engine
        } catch {
            status = "Haptics error: \(error.localizedDescription)"
        }
    }

    func setVibration(_ on: Bool) {
        on ? startVibration() : stopVibration()
    }

    private func startVibration() {
        guard let engine else { return }
        do {
            try engine.start()
            try? player?.stop(atTime: CHHapticTimeImmediate)
            let params = [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5),
            ]
            let period = 1 / pulseHz
            let event = CHHapticEvent(eventType: .hapticContinuous, parameters: params,
                                      relativeTime: 0, duration: pulsed ? period / 2 : 10)
            let pattern = try CHHapticPattern(events: [event], parameters: [])
            let player = try engine.makeAdvancedPlayer(with: pattern)
            player.loopEnabled = true
            if pulsed { player.loopEnd = period }
            try player.start(atTime: CHHapticTimeImmediate)
            self.player = player
            vibrating = true
            updateIntensity()
        } catch {
            status = "Couldn't vibrate: \(error.localizedDescription)"
        }
    }

    private func stopVibration() {
        try? player?.stop(atTime: CHHapticTimeImmediate)
        player = nil
        vibrating = false
    }

    private func updateIntensity() {
        let i = CHHapticDynamicParameter(parameterID: .hapticIntensityControl, value: intensity, relativeTime: 0)
        // Sharpness control is additive (-1...1) on top of the event's 0.5.
        let s = CHHapticDynamicParameter(parameterID: .hapticSharpnessControl, value: sharpness - 0.5, relativeTime: 0)
        try? player?.sendParameters([i, s], atTime: CHHapticTimeImmediate)
    }
}
