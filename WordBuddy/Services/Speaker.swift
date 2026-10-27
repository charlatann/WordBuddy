import AVFoundation
import SwiftUI

enum AudioSessionHelper {
    static func forPlayback() {
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? s.setActive(true)
    }

    static func forRecording() throws {
        let s = AVAudioSession.sharedInstance()
        try s.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
        try s.setActive(true)
    }
}

/// 标准发音：系统 TTS（en-US），支持慢速、不同角色不同声音、排队播放和等待播放结束
@MainActor
final class Speaker: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    static let shared = Speaker()

    @Published private(set) var isSpeaking = false
    @Published private(set) var speakingText: String?

    private let synth = AVSpeechSynthesizer()
    private var pending: Set<ObjectIdentifier> = []
    private var waiters: [CheckedContinuation<Void, Never>] = []

    private override init() {
        super.init()
        synth.delegate = self
    }

    /// 优先使用高质量声音，并让第 0、1 个声音性别不同，方便区分对话角色
    private lazy var voices: [AVSpeechSynthesisVoice] = {
        let all = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language == "en-US" && !$0.voiceTraits.contains(.isNoveltyVoice) }
            .sorted { $0.quality.rawValue > $1.quality.rawValue }
        guard let first = all.first else {
            return [AVSpeechSynthesisVoice(language: "en-US")].compactMap { $0 }
        }
        var ordered = [first]
        if let other = all.first(where: { $0.gender != first.gender && $0.gender != .unspecified }) {
            ordered.append(other)
        }
        ordered += all.filter { v in !ordered.contains { $0.identifier == v.identifier } }
        return ordered
    }()

    func speak(_ text: String, slow: Bool = false, voiceIndex: Int = 0, enqueue: Bool = false) {
        AudioSessionHelper.forPlayback()
        if !enqueue { stop() }
        let u = AVSpeechUtterance(string: text)
        if !voices.isEmpty { u.voice = voices[voiceIndex % voices.count] }
        u.rate = slow ? 0.3 : 0.45
        u.postUtteranceDelay = enqueue ? 0.35 : 0
        pending.insert(ObjectIdentifier(u))
        isSpeaking = true
        synth.speak(u)
    }

    /// 播放并等待结束（用于“标准音 → 我的录音”对比播放）
    func speakAndWait(_ text: String, slow: Bool = false) async {
        speak(text, slow: slow)
        await withCheckedContinuation { waiters.append($0) }
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
        pending.removeAll()
        flushIfIdle()
    }

    private func finished(_ id: ObjectIdentifier) {
        pending.remove(id)
        flushIfIdle()
    }

    private func flushIfIdle() {
        guard pending.isEmpty else { return }
        isSpeaking = false
        speakingText = nil
        let w = waiters
        waiters = []
        w.forEach { $0.resume() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        let text = utterance.speechString
        Task { @MainActor in self.speakingText = text }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        Task { @MainActor in self.finished(id) }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        Task { @MainActor in self.finished(id) }
    }
}
