import SwiftUI
import Charts

@main
struct GripSenseApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

struct ContentView: View {
    @StateObject private var sensor = GripSensor()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Grip Sense").font(.largeTitle.bold())

                Toggle("Vibrate", isOn: Binding(get: { sensor.vibrating }, set: sensor.setVibration))
                    .font(.headline)

                VStack(alignment: .leading) {
                    Text("Vibration strength \(Int(sensor.intensity * 100))%").font(.subheadline)
                    Slider(value: $sensor.intensity, in: 0.2...1)
                }

                VStack(alignment: .leading) {
                    Text("Sharpness \(Int(sensor.sharpness * 100))% (changes vibration frequency)").font(.subheadline)
                    Slider(value: $sensor.sharpness, in: 0...1)
                }

                Toggle("Pulsed (ignores hand movement)", isOn: $sensor.pulsed)

                Picker("Sensor", selection: $sensor.channel) {
                    ForEach(GripSensor.Channel.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)

                HStack {
                    reading("Accel RMS", sensor.accelRMS, "g")
                    reading("Gyro RMS", sensor.gyroRMS, "rad/s")
                    reading("Signal", sensor.signalLevel, sensor.pulsed ? "pulsed" : "raw")
                }

                chart

                gripMeter

                HStack {
                    Button("Calibrate loose") { sensor.calibrate("loose") }
                    Button("Calibrate squeeze") { sensor.calibrate("squeeze") }
                }
                .buttonStyle(.borderedProminent)
                .disabled(sensor.calibrating != nil)

                Button("Reset calibration", role: .destructive) { sensor.resetCalibration() }

                if !sensor.status.isEmpty {
                    Text(sensor.status).font(.callout).foregroundStyle(.secondary)
                }

                Text("How to test: turn on Vibrate, hold the phone lightly and watch the graph, then squeeze hard. If the line drops when you squeeze, it works. First check that the Signal number is clearly higher with Vibrate on than off; if not, move the Sharpness slider or switch sensors until it is. Calibrate both, then the meter shows how hard you're gripping.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .padding()
        }
        .onAppear { sensor.start() }
        .onDisappear { sensor.stop() }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { sensor.setVibration(false) }
        }
    }

    private func reading(_ label: String, _ value: Double, _ unit: String) -> some View {
        VStack(alignment: .leading) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(String(format: "%.4f", value)).font(.title2.monospacedDigit())
            Text(unit).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var chart: some View {
        Chart {
            ForEach(Array(sensor.history.enumerated()), id: \.offset) { i, v in
                LineMark(x: .value("t", i), y: .value("RMS", v))
            }
            if let l = sensor.looseLevel {
                RuleMark(y: .value("loose", l)).foregroundStyle(.green).lineStyle(StrokeStyle(dash: [4]))
            }
            if let q = sensor.squeezeLevel {
                RuleMark(y: .value("squeeze", q)).foregroundStyle(.red).lineStyle(StrokeStyle(dash: [4]))
            }
        }
        .chartXAxis(.hidden)
        .frame(height: 180)
    }

    private var gripMeter: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(sensor.grip.map { "Grip: \(Int($0 * 100))%" } ?? "Grip: calibrate first")
                .font(.title.bold())
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(.quaternary)
                    Capsule().fill(.orange).frame(width: geo.size.width * (sensor.grip ?? 0))
                }
            }
            .frame(height: 24)
            .animation(.linear(duration: 0.1), value: sensor.grip)
        }
    }
}
