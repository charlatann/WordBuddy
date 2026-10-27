import AVFoundation
import SwiftUI

enum RecordingError: LocalizedError {
    case tooShort
    var errorDescription: String? { "录音太短了，请说完整句再停止" }
}

/// 录音 + 回放
@MainActor
final class AudioRecorder: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var isRecording = false
    @Published private(set) var isPlaying = false
    @Published private(set) var level: Float = 0     // 0...1，用于录音动画
    @Published private(set) var elapsed: TimeInterval = 0

    static let maxDuration: TimeInterval = 15

    private var recorder: AVAudioRecorder?
    private var player: AVAudioPlayer?
    private var timer: Timer?
    private(set) var lastURL: URL?
    private(set) var lastDuration: TimeInterval = 0

    static var directory: URL {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Recordings", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func url(for fileName: String) -> URL { directory.appendingPathComponent(fileName) }

    static func requestPermission() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }

    @discardableResult
    func start() throws -> URL {
        stopPlaying()
        try AudioSessionHelper.forRecording()
        let url = Self.url(for: UUID().uuidString + ".m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
        let r = try AVAudioRecorder(url: url, settings: settings)
        r.isMeteringEnabled = true
        r.record()
        recorder = r
        lastURL = url
        elapsed = 0
        isRecording = true
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        return url
    }

    private func tick() {
        guard let r = recorder, r.isRecording else { return }
        r.updateMeters()
        let power = r.averagePower(forChannel: 0)          // -160...0 dB
        level = max(0, min(1, (power + 50) / 50))
        elapsed = r.currentTime
        if elapsed >= Self.maxDuration { _ = stop() }
    }

    /// 停止录音，返回录音文件（重复调用也会返回上一次的文件）
    func stop() -> URL? {
        if let r = recorder {
            lastDuration = r.currentTime
            r.stop()
            recorder = nil
        }
        timer?.invalidate()
        timer = nil
        isRecording = false
        level = 0
        AudioSessionHelper.forPlayback()
        return lastURL
    }

    func play(url: URL) {
        Speaker.shared.stop()
        stopPlaying()
        AudioSessionHelper.forPlayback()
        guard let p = try? AVAudioPlayer(contentsOf: url) else { return }
        p.delegate = self
        p.play()
        player = p
        isPlaying = true
    }

    func stopPlaying() {
        player?.stop()
        player = nil
        isPlaying = false
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.isPlaying = false }
    }
}
