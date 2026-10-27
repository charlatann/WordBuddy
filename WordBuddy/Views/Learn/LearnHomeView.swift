import SwiftUI
import SwiftData

struct LearnHomeView: View {
    @Query private var progress: [WordProgress]

    private var learnedIDs: Set<String> { Set(progress.map(\.wordID)) }
    private var dueCount: Int { progress.filter { $0.nextReview <= .now }.count }
    private var nextScene: LearningScene? {
        Content.allScenes.first { scene in !scene.wordIDs.allSatisfy(learnedIDs.contains) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    stats

                    if let next = nextScene {
                        NavigationLink(value: next) { NextUpCard(scene: next) }
                            .buttonStyle(.plain)
                    } else {
                        Text("🎉 全部 \(Content.allWords.count) 个单词都学完了！去复习和剧场巩固吧。")
                            .card()
                    }

                    ForEach(Content.units) { unit in
                        VStack(alignment: .leading, spacing: 12) {
                            Text("\(unit.emoji) 第\(unit.id)单元 · \(unit.title)").font(.title3.bold())
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 14)], spacing: 14) {
                                ForEach(unit.scenes) { scene in
                                    NavigationLink(value: scene) {
                                        SceneCard(scene: scene, learned: learnedIDs)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
                .padding()
                .readableWidth(900)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("学新词")
            .navigationDestination(for: LearningScene.self) { LearnSessionView(scene: $0) }
        }
    }

    private var stats: some View {
        HStack(spacing: 12) {
            statItem("\(learnedIDs.count)/\(Content.allWords.count)", "已学单词", "book.fill", .indigo)
            statItem("\(dueCount)", "待复习", "clock.fill", .orange)
            statItem("\(progress.filter(\.isMastered).count)", "已掌握", "star.fill", .green)
        }
    }

    private func statItem(_ value: String, _ title: String, _ icon: String, _ color: Color) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).foregroundStyle(color)
            Text(value).font(.title2.bold().monospacedDigit())
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .card(padding: 12)
    }
}

private struct NextUpCard: View {
    let scene: LearningScene
    var body: some View {
        HStack(spacing: 16) {
            Text(scene.emoji).font(.system(size: 48))
            VStack(alignment: .leading, spacing: 6) {
                Text("下一课").font(.caption.bold()).foregroundStyle(.white.opacity(0.8))
                Text(scene.title).font(.title2.bold()).foregroundStyle(.white)
                Text(scene.words.map(\.text).joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(.white.opacity(0.9))
            }
            Spacer()
            Image(systemName: "play.circle.fill").font(.system(size: 40)).foregroundStyle(.white)
        }
        .padding(20)
        .background(
            LinearGradient(colors: [.indigo, .purple], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

private struct SceneCard: View {
    let scene: LearningScene
    let learned: Set<String>

    private var done: Bool { scene.wordIDs.allSatisfy(learned.contains) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(scene.emoji).font(.largeTitle)
                VStack(alignment: .leading) {
                    Text(scene.title).font(.headline)
                    Text(scene.kind.rawValue).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if done {
                    Label("已学", systemImage: "checkmark.seal.fill")
                        .font(.caption.bold()).foregroundStyle(.green)
                }
            }
            FlowLayout(spacing: 6) {
                ForEach(scene.words) { WordChip(word: $0, learned: learned.contains($0.id)) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}
