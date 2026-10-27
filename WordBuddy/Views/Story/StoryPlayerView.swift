import SwiftUI
import SwiftData

/// 互动短剧播放器：台词自动朗读、选词填空、开口说台词并打分
struct StoryPlayerView: View {
    let story: InteractiveStory
    var onReplay: (() -> Void)? = nil

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var current = 0
    @State private var answers: [Int: String] = [:]
    @State private var shuffled: [Int: [String]] = [:]
    @State private var speakScores: [Int: Int] = [:]
    @State private var finished = false

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 14) {
                    header
                    ForEach(0...min(current, story.steps.count - 1), id: \.self) { i in
                        stepView(i).id(i)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    if finished { ending.id("end") }
                }
                .padding()
                .readableWidth()
            }
            .onChange(of: current) { _, new in
                withAnimation { proxy.scrollTo(new, anchor: .bottom) }
            }
            .onChange(of: finished) { _, done in
                if done { withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
            }
        }
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .bottom) { if !finished { bottomBar } }
        .navigationTitle("\(story.emoji) \(story.title)")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { autoSpeak(0) }
        .onDisappear { Speaker.shared.stop() }
    }

    private var header: some View {
        VStack(spacing: 6) {
            Text(story.emoji).font(.system(size: 54))
            Text(story.title).font(.title2.bold())
            Text(story.intro).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .padding(.vertical, 8)
    }

    // MARK: - 每一步

    @ViewBuilder
    private func stepView(_ i: Int) -> some View {
        switch story.steps[i] {
        case let .line(speaker, en, zh):
            let vi = story.voiceIndex(for: speaker)
            LineBubble(line: SceneLine(speaker: speaker, en: en, zh: zh),
                       highlight: story.wordIDs, alignRight: vi % 2 == 0, voiceIndex: vi)

        case let .fill(speaker, en, zh, answer, options):
            fillView(i, speaker: speaker, en: en, zh: zh, answer: answer, options: options)

        case let .speak(en, zh):
            VStack(spacing: 12) {
                Label("轮到你说台词了！", systemImage: "theatermasks.fill").font(.headline).foregroundStyle(.pink)
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(en).font(.title3.weight(.semibold))
                        Text(zh).font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    SpeakButton(text: en)
                }
                PracticePanel(text: en) { r in speakScores[i] = r.score }
            }
            .card()
        }
    }

    private func fillView(_ i: Int, speaker: String?, en: String, zh: String, answer: String, options: [String]) -> some View {
        let picked = answers[i]
        let opts = shuffled[i] ?? options
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("选词填空", systemImage: "puzzlepiece.fill").font(.caption.bold()).foregroundStyle(.indigo)
                Spacer()
                if let picked {
                    Text(picked == answer ? "✅ 答对了" : "❌ 正确答案：\(answer)")
                        .font(.caption.bold()).foregroundStyle(picked == answer ? .green : .red)
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                if let speaker { Text(speaker).font(.caption.bold()).foregroundStyle(.secondary) }
                if picked == nil {
                    Text(TextTools.blank(en, word: answer)).font(.title3)
                } else {
                    Text(TextTools.highlighted(en, words: [answer])).font(.title3)
                }
                Text(zh).font(.footnote).foregroundStyle(.secondary)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(opts, id: \.self) { opt in
                    Button { choose(opt, step: i, answer: answer, sentence: en, speaker: speaker) } label: {
                        Text(opt)
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: 46)
                            .background(color(for: opt, picked: picked, answer: answer), in: RoundedRectangle(cornerRadius: 12))
                            .foregroundStyle(.primary)
                    }
                    .buttonStyle(.plain)
                    .disabled(picked != nil)
                }
            }
        }
        .card()
        .onAppear { if shuffled[i] == nil { shuffled[i] = options.shuffled() } }
    }

    private func color(for opt: String, picked: String?, answer: String) -> Color {
        guard let picked else { return Color(.tertiarySystemGroupedBackground) }
        if opt == answer { return .green.opacity(0.3) }
        if opt == picked { return .red.opacity(0.3) }
        return Color(.tertiarySystemGroupedBackground)
    }

    private func choose(_ opt: String, step: Int, answer: String, sentence: String, speaker: String?) {
        withAnimation { answers[step] = opt }
        let ok = opt == answer
        UINotificationFeedbackGenerator().notificationOccurred(ok ? .success : .error)
        Speaker.shared.speak(sentence, voiceIndex: story.voiceIndex(for: speaker))
        updateMemory(word: answer, correct: ok)
    }

    /// 剧场里的表现也会反馈到复习计划：到期的词答对算一次复习，答错则提前复习
    private func updateMemory(word: String, correct: Bool) {
        let fd = FetchDescriptor<WordProgress>(predicate: #Predicate { $0.wordID == word })
        guard let p = try? context.fetch(fd).first else { return }
        if correct {
            if p.nextReview <= .now { Ebbinghaus.apply(.good, to: p) }
        } else {
            p.stage = max(0, p.stage - 1)
            p.nextReview = min(p.nextReview, Date().addingTimeInterval(10 * 60))
        }
        try? context.save()
    }

    // MARK: - 底部操作

    private var canAdvance: Bool {
        if case .fill = story.steps[current] { return answers[current] != nil }
        return true
    }

    private var bottomBar: some View {
        VStack(spacing: 8) {
            ProgressView(value: Double(current + 1), total: Double(story.steps.count)).tint(.pink)
            Button {
                Speaker.shared.stop()
                if current < story.steps.count - 1 {
                    withAnimation { current += 1 }
                    autoSpeak(current)
                } else {
                    withAnimation { finished = true }
                }
            } label: {
                Text(buttonTitle)
            }
            .buttonStyle(PrimaryButtonStyle(color: canAdvance ? .pink : .gray))
            .disabled(!canAdvance)
        }
        .padding()
        .readableWidth()
        .background(.bar)
    }

    private var buttonTitle: String {
        if !canAdvance { return "先选一个答案" }
        if current == story.steps.count - 1 { return "谢幕 🎬" }
        if case .speak = story.steps[current] { return speakScores[current] == nil ? "跳过，继续" : "继续" }
        return "继续 ▶︎"
    }

    private func autoSpeak(_ i: Int) {
        guard story.steps.indices.contains(i), case let .line(speaker, en, _) = story.steps[i] else { return }
        Speaker.shared.speak(en, voiceIndex: story.voiceIndex(for: speaker))
    }

    // MARK: - 结局

    private var ending: some View {
        let fills = story.steps.indices.filter { if case .fill = story.steps[$0] { return true }; return false }
        let right = fills.filter { i in
            if case let .fill(_, _, _, answer, _) = story.steps[i] { return answers[i] == answer }
            return false
        }.count
        let scores = Array(speakScores.values)
        return VStack(spacing: 16) {
            Text("🎬 剧终").font(.largeTitle.bold())
            HStack(spacing: 12) {
                stat("\(right)/\(fills.count)", "填空答对")
                stat(scores.isEmpty ? "—" : "\(scores.reduce(0, +) / scores.count)", "台词得分")
            }
            Text("本场出演的单词").font(.subheadline).foregroundStyle(.secondary)
            FlowLayout(spacing: 6) {
                ForEach(story.wordIDs, id: \.self) { id in
                    if let w = Content.wordByID[id] { WordChip(word: w) }
                }
            }
            if story.isRemix, let onReplay {
                Button { onReplay() } label: { Label("再来一段", systemImage: "dice.fill") }
                    .buttonStyle(PrimaryButtonStyle(color: .pink))
            }
            Button("完成") { dismiss() }.buttonStyle(PrimaryButtonStyle(color: .gray))
        }
        .card(padding: 24)
    }

    private func stat(_ v: String, _ t: String) -> some View {
        VStack {
            Text(v).font(.title.bold()).foregroundStyle(.pink)
            Text(t).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(Color.pink.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
    }
}
