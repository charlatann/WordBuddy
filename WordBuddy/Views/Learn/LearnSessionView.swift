import SwiftUI
import SwiftData

/// 一节课：认识单词 → 看场景 → 听音选义小测 → 加入复习计划
struct LearnSessionView: View {
    let scene: LearningScene

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    enum Phase: Int, CaseIterable { case words, scene, quiz, done }
    @State private var phase: Phase = .words
    @State private var wordIndex = 0
    @State private var quiz: [QuizItem] = []
    @State private var quizIndex = 0
    @State private var picked: String?
    @State private var correct = 0

    struct QuizItem { let word: Word; let options: [String] }

    var body: some View {
        VStack(spacing: 0) {
            ProgressView(value: progressValue)
                .tint(.indigo)
                .padding(.horizontal)
                .padding(.top, 6)
            ScrollView {
                Group {
                    switch phase {
                    case .words: wordsStep
                    case .scene: sceneStep
                    case .quiz: quizStep
                    case .done: doneStep
                    }
                }
                .padding()
                .readableWidth()
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("\(scene.emoji) \(scene.title)")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            quiz = scene.words.shuffled().map { w in
                let others = Content.allWords.filter { $0.id != w.id }.shuffled().prefix(3).map(\.meaning)
                return QuizItem(word: w, options: ([w.meaning] + others).shuffled())
            }
            speakCurrentWord()
        }
        .onDisappear { Speaker.shared.stop() }
    }

    private var progressValue: Double {
        switch phase {
        case .words: return Double(wordIndex + 1) / Double(scene.words.count) * 0.35
        case .scene: return 0.5
        case .quiz: return 0.6 + Double(quizIndex) / Double(max(1, quiz.count)) * 0.35
        case .done: return 1
        }
    }

    // MARK: 1. 认识单词

    private var wordsStep: some View {
        let word = scene.words[wordIndex]
        let examples = scene.lines(containing: word.id)
        return VStack(spacing: 20) {
            Text("新单词 \(wordIndex + 1)/\(scene.words.count)").font(.subheadline).foregroundStyle(.secondary)
            VStack(spacing: 14) {
                Text(word.emoji).font(.system(size: 90))
                Text(word.text).font(.system(size: 46, weight: .bold, design: .rounded))
                Text("\(word.phonetic)  \(word.pos)").font(.title3).foregroundStyle(.secondary)
                Text(word.meaning).font(.title2.weight(.semibold))
                HStack(spacing: 20) {
                    SpeakButton(text: word.text, size: 26)
                    SpeakButton(text: word.text, slow: true, size: 26)
                }
            }
            .frame(maxWidth: .infinity)
            .card(padding: 28)
            .id(word.id)
            .transition(.asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading)).combined(with: .opacity))

            if let ex = examples.first {
                VStack(alignment: .leading, spacing: 6) {
                    Text("场景预告").font(.caption.bold()).foregroundStyle(.secondary)
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(TextTools.highlighted(ex.en, words: [word.id]))
                            Text(ex.zh).font(.footnote).foregroundStyle(.secondary)
                        }
                        Spacer()
                        SpeakButton(text: ex.en, size: 16)
                    }
                }
                .card()
            }

            HStack(spacing: 12) {
                if wordIndex > 0 {
                    Button("上一个") { withAnimation { wordIndex -= 1 }; speakCurrentWord() }
                        .buttonStyle(PrimaryButtonStyle(color: .gray))
                }
                Button(wordIndex < scene.words.count - 1 ? "下一个" : "进入场景 ▶︎") {
                    withAnimation {
                        if wordIndex < scene.words.count - 1 { wordIndex += 1 } else { phase = .scene }
                    }
                    if phase == .words { speakCurrentWord() }
                }
                .buttonStyle(PrimaryButtonStyle())
            }
        }
    }

    // MARK: 2. 场景

    private var sceneStep: some View {
        VStack(spacing: 20) {
            Text("在场景里认识它们 👇 点一点每句话听发音").font(.subheadline).foregroundStyle(.secondary)
            ScenePlayerView(scene: scene).card()
            VStack(alignment: .leading, spacing: 8) {
                Label("今日日常用语", systemImage: "quote.bubble.fill").font(.headline).foregroundStyle(.orange)
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(scene.keyPhrase.en).font(.title3.weight(.semibold))
                        Text(scene.keyPhrase.zh).font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    SpeakButton(text: scene.keyPhrase.en)
                }
            }
            .card()
            Button("小测验 ▶︎") {
                Speaker.shared.stop()
                withAnimation { phase = .quiz }
                speakQuizWord()
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }

    // MARK: 3. 听音选义

    @ViewBuilder
    private var quizStep: some View {
        if quizIndex < quiz.count {
            let item = quiz[quizIndex]
            VStack(spacing: 20) {
                Text("听一听，选出正确的意思（\(quizIndex + 1)/\(quiz.count)）")
                    .font(.subheadline).foregroundStyle(.secondary)
                VStack(spacing: 10) {
                    SpeakButton(text: item.word.text, size: 34)
                    Text(item.word.text).font(.largeTitle.bold())
                    Text(item.word.phonetic).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .card(padding: 24)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(item.options, id: \.self) { opt in
                        Button { choose(opt, item: item) } label: {
                            Text(opt)
                                .font(.headline)
                                .frame(maxWidth: .infinity, minHeight: 56)
                                .padding(.horizontal, 6)
                                .background(optionColor(opt, item: item), in: RoundedRectangle(cornerRadius: 14))
                                .foregroundStyle(.primary)
                        }
                        .buttonStyle(.plain)
                        .disabled(picked != nil)
                    }
                }
                if picked != nil {
                    Button(quizIndex < quiz.count - 1 ? "下一题" : "完成本课 🎉") { nextQuiz() }
                        .buttonStyle(PrimaryButtonStyle())
                }
            }
        }
    }

    private func optionColor(_ opt: String, item: QuizItem) -> Color {
        guard let picked else { return Color(.secondarySystemGroupedBackground) }
        if opt == item.word.meaning { return .green.opacity(0.3) }
        if opt == picked { return .red.opacity(0.3) }
        return Color(.secondarySystemGroupedBackground)
    }

    private func choose(_ opt: String, item: QuizItem) {
        picked = opt
        if opt == item.word.meaning {
            correct += 1
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } else {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    private func nextQuiz() {
        picked = nil
        if quizIndex < quiz.count - 1 {
            quizIndex += 1
            speakQuizWord()
        } else {
            saveProgress()
            withAnimation { phase = .done }
        }
    }

    // MARK: 4. 完成

    private var doneStep: some View {
        VStack(spacing: 20) {
            Text("🎉").font(.system(size: 80))
            Text("本课完成！").font(.largeTitle.bold())
            Text("小测验答对 \(correct)/\(quiz.count)").font(.title3)
            VStack(alignment: .leading, spacing: 10) {
                Label("已加入复习计划", systemImage: "calendar.badge.clock").font(.headline)
                Text("按照艾宾浩斯遗忘曲线，第一次复习在 5 分钟后，之后是 30 分钟、12 小时、1 天、2 天、4 天、7 天、15 天、30 天。到时间会提醒你。")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            .card()

            NavigationLink {
                PronunciationPracticeView(text: scene.keyPhrase.en, zh: scene.keyPhrase.zh)
            } label: {
                Label("跟读今日用语，练练发音", systemImage: "mic.fill")
            }
            .buttonStyle(PrimaryButtonStyle(color: .orange))

            Button("返回") { dismiss() }
                .buttonStyle(PrimaryButtonStyle(color: .gray))
        }
    }

    // MARK: - 辅助

    private func speakCurrentWord() {
        guard phase == .words, scene.words.indices.contains(wordIndex) else { return }
        Speaker.shared.speak(scene.words[wordIndex].text)
    }

    private func speakQuizWord() {
        guard quiz.indices.contains(quizIndex) else { return }
        Speaker.shared.speak(quiz[quizIndex].word.text)
    }

    private func saveProgress() {
        for w in scene.words {
            let id = w.id
            let fd = FetchDescriptor<WordProgress>(predicate: #Predicate { $0.wordID == id })
            if (try? context.fetchCount(fd)) ?? 0 == 0 {
                context.insert(WordProgress(wordID: w.id, sceneID: scene.id))
            }
        }
        try? context.save()
    }
}
