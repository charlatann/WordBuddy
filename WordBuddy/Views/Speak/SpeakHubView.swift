import SwiftUI
import SwiftData
import Charts

struct SpeakHubView: View {
    @Query(sort: \WordProgress.learnedAt) private var progress: [WordProgress]
    @Query(sort: \PracticeRecord.date, order: .reverse) private var records: [PracticeRecord]
    @StateObject private var player = AudioRecorder()

    enum Mode: String, CaseIterable { case words = "单词", phrases = "日常用语", history = "我的进步" }
    @State private var mode: Mode = .words

    /// 已学过的单词；一个都没学时先给第一单元
    private var words: [(Word, WordProgress?)] {
        let learned = progress.compactMap { p in p.word.map { ($0, Optional(p)) } }
        return learned.isEmpty ? Content.units[0].scenes.flatMap(\.words).map { ($0, WordProgress?.none) } : learned
    }

    private var scenes: [LearningScene] {
        let ids = Set(progress.map(\.sceneID))
        let learned = Content.allScenes.filter { ids.contains($0.id) }
        return learned.isEmpty ? Array(Content.units[0].scenes) : learned
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Picker("模式", selection: $mode) {
                        ForEach(Mode.allCases, id: \.self) { Text($0.rawValue) }
                    }
                    .pickerStyle(.segmented)

                    if progress.isEmpty && mode != .history {
                        Text("还没学过单词，先用第一单元的内容练练吧～").font(.footnote).foregroundStyle(.secondary)
                    }

                    switch mode {
                    case .words: wordList
                    case .phrases: phraseList
                    case .history: history
                    }
                }
                .padding()
                .readableWidth(900)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("发音练习")
        }
    }

    private var wordList: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
            ForEach(words, id: \.0.id) { word, p in
                NavigationLink {
                    PronunciationPracticeView(text: word.text, zh: word.meaning, phonetic: word.phonetic, wordID: word.id)
                } label: {
                    VStack(spacing: 6) {
                        Text(word.emoji).font(.largeTitle)
                        Text(word.text).font(.headline)
                        Text(word.phonetic).font(.caption).foregroundStyle(.secondary)
                        if let best = p?.bestScore {
                            Text("最佳 \(best) 分").font(.caption2.bold())
                                .foregroundStyle(best >= 75 ? Color.green : Color.orange)
                        } else {
                            Text("未练习").font(.caption2).foregroundStyle(.tertiary)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .card(padding: 14)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var phraseList: some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(scenes) { scene in
                VStack(alignment: .leading, spacing: 0) {
                    Text("\(scene.emoji) \(scene.title)").font(.headline).padding(.bottom, 8)
                    ForEach(Array(scene.lines.enumerated()), id: \.offset) { i, line in
                        NavigationLink {
                            PronunciationPracticeView(text: line.en, zh: line.zh)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(line.en).font(.body.weight(i == scene.keyLine ? .semibold : .regular))
                                    Text(line.zh).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if i == scene.keyLine {
                                    Text("常用").font(.caption2.bold()).foregroundStyle(.orange)
                                        .padding(.horizontal, 6).padding(.vertical, 2)
                                        .background(Color.orange.opacity(0.15), in: Capsule())
                                }
                                Image(systemName: "mic.circle.fill").font(.title2).foregroundStyle(.indigo)
                            }
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        Divider()
                    }
                }
                .card()
            }
        }
    }

    @ViewBuilder
    private var history: some View {
        if records.isEmpty {
            Text("还没有练习记录。录一段跟读，就能在这里看到自己的进步曲线。")
                .foregroundStyle(.secondary).card()
        } else {
            let recent = Array(records.prefix(30).reversed())
            let avg = recent.map(\.score).reduce(0, +) / recent.count
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("最近 \(recent.count) 次平均").font(.headline)
                    Spacer()
                    Text("\(avg) 分").font(.title2.bold()).foregroundStyle(.indigo)
                }
                Chart(Array(recent.enumerated()), id: \.offset) { i, r in
                    LineMark(x: .value("次数", i + 1), y: .value("分数", r.score))
                        .interpolationMethod(.catmullRom)
                    PointMark(x: .value("次数", i + 1), y: .value("分数", r.score))
                        .foregroundStyle(r.score >= 75 ? Color.green : Color.orange)
                }
                .chartYScale(domain: 0...100)
                .frame(height: 180)
            }
            .card()

            VStack(alignment: .leading, spacing: 0) {
                Text("练习记录").font(.headline).padding(.bottom, 8)
                ForEach(records.prefix(50)) { r in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.text).lineLimit(1)
                            Text(r.date.formatted(date: .abbreviated, time: .shortened)).font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("\(r.score)").font(.headline.monospacedDigit())
                            .foregroundStyle(r.score >= 75 ? Color.green : (r.score >= 50 ? Color.orange : Color.red))
                        if let f = r.audioFileName {
                            Button { player.play(url: AudioRecorder.url(for: f)) } label: {
                                Image(systemName: "play.circle.fill").font(.title2)
                            }
                            .buttonStyle(.plain).foregroundStyle(.indigo)
                        }
                    }
                    .padding(.vertical, 8)
                    Divider()
                }
            }
            .card()
        }
    }
}

struct PronunciationPracticeView: View {
    let text: String
    let zh: String
    var phonetic: String? = nil
    var wordID: String? = nil

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                VStack(spacing: 10) {
                    Text(text)
                        .font(.system(size: text.count < 14 ? 44 : 28, weight: .bold, design: .rounded))
                        .multilineTextAlignment(.center)
                    if let phonetic { Text(phonetic).font(.title3).foregroundStyle(.secondary) }
                    Text(zh).font(.title3).foregroundStyle(.secondary)
                    HStack(spacing: 20) {
                        SpeakButton(text: text, size: 24)
                        SpeakButton(text: text, slow: true, size: 24)
                    }
                    Text("🔊 标准  ·  🐢 慢速").font(.caption).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .card(padding: 24)

                PracticePanel(text: text, wordID: wordID)
                    .card(padding: 20)

                Text("评分基于 Apple 语音识别：能被准确识别的单词越多、越清晰，分数越高。结果仅供参考，多听多练最重要！")
                    .font(.caption).foregroundStyle(.tertiary).multilineTextAlignment(.center)
            }
            .padding()
            .readableWidth()
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("跟读打分")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { Speaker.shared.stop() }
    }
}
