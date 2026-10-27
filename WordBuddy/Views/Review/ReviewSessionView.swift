import SwiftUI
import SwiftData

/// 复习：先看单词 + 原场景里的句子回忆意思，再翻开答案自评
struct ReviewSessionView: View {
    let wordIDs: [String]
    let early: Bool

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var index = 0
    @State private var revealed = false
    @State private var showScene = false
    @State private var tally: [ReviewGrade: Int] = [:]

    private var current: Word? {
        wordIDs.indices.contains(index) ? Content.wordByID[wordIDs[index]] : nil
    }

    var body: some View {
        VStack(spacing: 0) {
            ProgressView(value: Double(index), total: Double(max(1, wordIDs.count)))
                .tint(.orange).padding(.horizontal).padding(.top, 6)
            ScrollView {
                Group {
                    if let word = current, let scene = Content.sceneByWordID[word.id] {
                        card(word: word, scene: scene)
                    } else {
                        summary
                    }
                }
                .padding()
                .readableWidth()
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(early ? "提前练习" : "复习")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { speakCurrent() }
        .onDisappear { Speaker.shared.stop() }
        .sheet(isPresented: $showScene) {
            if let word = current, let scene = Content.sceneByWordID[word.id] {
                NavigationStack {
                    ScrollView { ScenePlayerView(scene: scene, highlight: [word.id]).padding() }
                        .navigationTitle("回看场景")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar { Button("关闭") { showScene = false } }
                }
                .presentationDetents([.medium, .large])
            }
        }
    }

    // MARK: 复习卡片

    private func card(word: Word, scene: LearningScene) -> some View {
        let examples = scene.lines(containing: word.id)
        return VStack(spacing: 18) {
            Text("\(index + 1) / \(wordIDs.count)").font(.subheadline).foregroundStyle(.secondary)

            VStack(spacing: 12) {
                Text(word.text).font(.system(size: 44, weight: .bold, design: .rounded))
                Text(word.phonetic).font(.title3).foregroundStyle(.secondary)
                HStack(spacing: 16) {
                    SpeakButton(text: word.text, size: 22)
                    SpeakButton(text: word.text, slow: true, size: 22)
                }
                if revealed {
                    Divider()
                    Text("\(word.emoji) \(word.pos) \(word.meaning)").font(.title2.weight(.semibold))
                        .transition(.opacity)
                }
            }
            .frame(maxWidth: .infinity)
            .card(padding: 24)

            // 学习时的场景
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("来自场景：\(scene.emoji) \(scene.title)", systemImage: "mappin.and.ellipse")
                        .font(.subheadline.bold()).foregroundStyle(.indigo)
                    Spacer()
                    Button("回看完整场景") { showScene = true }.font(.footnote)
                }
                ForEach(examples, id: \.self) { line in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(line.speaker.map { "\($0): " } ?? "").font(.caption.bold()).foregroundColor(.secondary)
                            + Text(TextTools.highlighted(line.en, words: [word.id]))
                            if revealed { Text(line.zh).font(.footnote).foregroundStyle(.secondary) }
                        }
                        Spacer()
                        SpeakButton(text: line.en, voiceIndex: scene.voiceIndex(for: line.speaker), size: 14)
                    }
                }
                if !revealed {
                    Text("💡 想一想：它在这个场景里是什么意思？").font(.footnote).foregroundStyle(.secondary)
                }
            }
            .card()

            if revealed {
                Text("你记得怎么样？").font(.headline)
                HStack(spacing: 10) {
                    gradeButton("忘记了", "从头再来", .red, .forgot)
                    gradeButton("有点模糊", "原间隔再来", .orange, .hard)
                    gradeButton("记住了", nextLabel(), .green, .good)
                }
            } else {
                Button("显示答案") { withAnimation { revealed = true } }
                    .buttonStyle(PrimaryButtonStyle(color: .orange))
            }
        }
    }

    private func nextLabel() -> String {
        guard let p = fetch(wordIDs[index]) else { return "" }
        if early { return "保持计划" }
        let next = p.stage + 1
        return next < Ebbinghaus.labels.count ? "\(Ebbinghaus.labels[next])后" : "已掌握"
    }

    private func gradeButton(_ title: String, _ sub: String, _ color: Color, _ g: ReviewGrade) -> some View {
        Button { self.grade(g) } label: {
            VStack(spacing: 4) {
                Text(title).font(.headline)
                Text(sub).font(.caption2).opacity(0.85)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(color, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    private func grade(_ g: ReviewGrade) {
        if let p = fetch(wordIDs[index]) {
            Ebbinghaus.apply(g, to: p, early: early)
            try? context.save()
        }
        tally[g, default: 0] += 1
        revealed = false
        withAnimation { index += 1 }
        speakCurrent()
    }

    private func fetch(_ id: String) -> WordProgress? {
        let fd = FetchDescriptor<WordProgress>(predicate: #Predicate { $0.wordID == id })
        return try? context.fetch(fd).first
    }

    private func speakCurrent() {
        if let w = current { Speaker.shared.speak(w.text) }
    }

    // MARK: 总结

    private var summary: some View {
        VStack(spacing: 18) {
            Text("💪").font(.system(size: 80))
            Text("复习完成！").font(.largeTitle.bold())
            HStack(spacing: 12) {
                tallyItem("记住了", tally[.good] ?? 0, .green)
                tallyItem("有点模糊", tally[.hard] ?? 0, .orange)
                tallyItem("忘记了", tally[.forgot] ?? 0, .red)
            }
            Text(early ? "提前练习不会打乱你的复习计划（忘记的词会重新安排）。"
                       : "下一轮复习时间已按遗忘曲线自动安排，到时会提醒你。")
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button("完成") { dismiss() }.buttonStyle(PrimaryButtonStyle(color: .orange))
        }
    }

    private func tallyItem(_ t: String, _ n: Int, _ c: Color) -> some View {
        VStack {
            Text("\(n)").font(.title.bold()).foregroundStyle(c)
            Text(t).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .card(padding: 12)
    }
}
