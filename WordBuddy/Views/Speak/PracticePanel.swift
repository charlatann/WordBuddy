import SwiftUI
import SwiftData

/// 跟读面板：录音 → 回放 → 打分。发音练习页和互动短剧共用。
struct PracticePanel: View {
    let text: String
    var wordID: String? = nil
    var onScored: ((PronunciationResult) -> Void)? = nil

    @Environment(\.modelContext) private var context
    @StateObject private var recorder = AudioRecorder()
    @State private var phase: Phase = .idle
    @State private var lastURL: URL?

    enum Phase: Equatable {
        case idle, recording, analyzing
        case result(PronunciationResult)
        case error(String)
    }

    var body: some View {
        VStack(spacing: 16) {
            recordButton
            statusText

            if case .result(let r) = phase {
                ResultCard(result: r)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if case .error(let msg) = phase {
                Text(msg).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
            }

            if lastURL != nil && phase != .recording && phase != .analyzing {
                HStack(spacing: 12) {
                    Button {
                        if recorder.isPlaying { recorder.stopPlaying() }
                        else if let u = lastURL { recorder.play(url: u) }
                    } label: {
                        Label(recorder.isPlaying ? "停止" : "我的录音", systemImage: recorder.isPlaying ? "stop.fill" : "person.wave.2.fill")
                    }
                    Button {
                        Task {
                            recorder.stopPlaying()
                            await Speaker.shared.speakAndWait(text)
                            try? await Task.sleep(for: .milliseconds(300))
                            if let u = lastURL { recorder.play(url: u) }
                        }
                    } label: {
                        Label("对比听", systemImage: "arrow.left.arrow.right")
                    }
                }
                .buttonStyle(.bordered)
                .font(.subheadline)
            }
        }
        .animation(.easeInOut, value: phase)
        .onChange(of: recorder.isRecording) { _, isRecording in
            // 超过最长录音时间自动停止
            if !isRecording && phase == .recording { finish() }
        }
        .onDisappear {
            if recorder.isRecording { _ = recorder.stop() }
            recorder.stopPlaying()
        }
    }

    private var recordButton: some View {
        Button { toggle() } label: {
            ZStack {
                Circle()
                    .fill((phase == .recording ? Color.red : Color.indigo).opacity(0.18))
                    .frame(width: 104, height: 104)
                    .scaleEffect(phase == .recording ? 1 + CGFloat(recorder.level) * 0.35 : 1)
                    .animation(.easeOut(duration: 0.08), value: recorder.level)
                Circle()
                    .fill(phase == .recording ? Color.red : Color.indigo)
                    .frame(width: 78, height: 78)
                if phase == .analyzing {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: phase == .recording ? "stop.fill" : "mic.fill")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(.white)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(phase == .analyzing)
        .accessibilityLabel(phase == .recording ? "停止录音" : "开始录音")
    }

    private var statusText: some View {
        Group {
            switch phase {
            case .idle, .error: Text("先听标准音，再点麦克风跟读")
            case .recording: Text("录音中 \(String(format: "%.1f", recorder.elapsed))s · 说完点击停止")
            case .analyzing: Text("正在分析你的发音…")
            case .result: Text("点击麦克风可以再录一次")
            }
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
    }

    // MARK: - 动作

    private func toggle() {
        if phase == .recording { finish() } else { Task { await begin() } }
    }

    private func begin() async {
        Speaker.shared.stop()
        guard await AudioRecorder.requestPermission() else {
            phase = .error("请在「设置 › 单词伙伴」中允许使用麦克风")
            return
        }
        do {
            try recorder.start()
            phase = .recording
        } catch {
            phase = .error("无法开始录音：\(error.localizedDescription)")
        }
    }

    private func finish() {
        phase = .analyzing
        guard let url = recorder.stop() else { phase = .idle; return }
        lastURL = url
        guard recorder.lastDuration >= 0.4 else {
            phase = .error(RecordingError.tooShort.localizedDescription)
            return
        }
        Task {
            do {
                let r = try await PronunciationScorer.score(audio: url, expected: text)
                phase = .result(r)
                save(r, url: url)
                onScored?(r)
            } catch {
                phase = .error(error.localizedDescription)
            }
        }
    }

    private func save(_ r: PronunciationResult, url: URL) {
        context.insert(PracticeRecord(text: text, score: r.score, audioFileName: url.lastPathComponent))
        if let wordID {
            let fd = FetchDescriptor<WordProgress>(predicate: #Predicate { $0.wordID == wordID })
            if let p = try? context.fetch(fd).first, r.score > (p.bestScore ?? -1) { p.bestScore = r.score }
        }
        // 只保留最近 100 条练习录音
        var old = FetchDescriptor<PracticeRecord>(sortBy: [SortDescriptor(\.date, order: .reverse)])
        old.fetchOffset = 100
        for rec in (try? context.fetch(old)) ?? [] {
            if let f = rec.audioFileName { try? FileManager.default.removeItem(at: AudioRecorder.url(for: f)) }
            context.delete(rec)
        }
        try? context.save()
    }
}

// MARK: - 打分结果

struct ResultCard: View {
    let result: PronunciationResult

    var body: some View {
        VStack(spacing: 14) {
            HStack(spacing: 18) {
                ScoreRing(score: result.score, color: result.color)
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(result.emoji) \(result.title)").font(.headline)
                    metric("准确度", result.accuracy)
                    metric("清晰度", result.clarity)
                    metric("流利度", result.fluency)
                }
            }
            FlowLayout(spacing: 6) {
                ForEach(result.words) { w in
                    Text(w.text)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(w.matched ? Color.green : Color.red)
                        .underline(!w.matched, color: .red)
                }
            }
            if !result.recognized.isEmpty {
                Text("我听到的是：\(result.recognized)")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Text("绿色=读对 · 红色=没听清，多听几遍标准音再试")
                .font(.caption2).foregroundStyle(.tertiary)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(result.color.opacity(0.06), in: RoundedRectangle(cornerRadius: 18))
    }

    private func metric(_ name: String, _ value: Double) -> some View {
        HStack(spacing: 8) {
            Text(name).font(.caption).foregroundStyle(.secondary).frame(width: 44, alignment: .leading)
            ProgressView(value: max(0, min(1, value))).tint(result.color).frame(width: 110)
            Text("\(Int(value * 100))").font(.caption.monospacedDigit()).frame(width: 28, alignment: .trailing)
        }
    }
}
