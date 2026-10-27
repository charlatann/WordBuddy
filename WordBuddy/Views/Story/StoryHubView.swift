import SwiftUI
import SwiftData

struct StoryHubView: View {
    @Query private var progress: [WordProgress]
    @AppStorage(NotificationService.storyRemindersKey) private var remindersOn = true
    @State private var activeStory: InteractiveStory?

    private var learnedIDs: Set<String> { Set(progress.map(\.wordID)) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    remixCard
                    Text("🎭 短剧场").font(.title3.bold())
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 14)], spacing: 14) {
                        ForEach(StoryLibrary.curated) { story in curatedCard(story) }
                    }
                    reminderCard
                }
                .padding()
                .readableWidth(900)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("互动剧场")
            .navigationDestination(item: $activeStory) { story in
                StoryPlayerView(story: story) {
                    // 随机剧场“再来一段”
                    activeStory = StoryGenerator.remix(from: progress)
                }
                .id(story.id)
            }
        }
    }

    private var remixCard: some View {
        let canPlay = learnedIDs.count >= 3
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("🎲").font(.system(size: 44))
                VStack(alignment: .leading, spacing: 4) {
                    Text("随机小剧场").font(.title2.bold()).foregroundStyle(.white)
                    Text(canPlay ? "用你学过的单词即兴生成一段互动短剧，优先安排快要忘记的词"
                                 : "再学 \(3 - learnedIDs.count) 个单词就能解锁")
                        .font(.subheadline).foregroundStyle(.white.opacity(0.9))
                }
            }
            Button {
                activeStory = StoryGenerator.remix(from: progress)
            } label: {
                Label("开演！", systemImage: "play.fill")
                    .font(.headline)
                    .foregroundStyle(.pink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(.white, in: RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
            .disabled(!canPlay)
            .opacity(canPlay ? 1 : 0.5)
        }
        .padding(20)
        .background(LinearGradient(colors: [.pink, .orange], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func curatedCard(_ story: InteractiveStory) -> some View {
        let learnedCount = story.wordIDs.filter(learnedIDs.contains).count
        let unlocked = learnedCount == story.wordIDs.count
        return Button {
            activeStory = story
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(story.emoji).font(.largeTitle)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(story.title).font(.headline)
                        Text(story.intro).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                    Spacer()
                    Image(systemName: unlocked ? "play.circle.fill" : "lock.fill")
                        .font(.title2).foregroundStyle(unlocked ? Color.pink : Color.gray)
                }
                FlowLayout(spacing: 6) {
                    ForEach(story.wordIDs, id: \.self) { id in
                        if let w = Content.wordByID[id] { WordChip(word: w, learned: learnedIDs.contains(id)) }
                    }
                }
                if !unlocked {
                    Text("已学 \(learnedCount)/\(story.wordIDs.count)，学完这些单词即可解锁")
                        .font(.caption).foregroundStyle(.orange)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
            .opacity(unlocked ? 1 : 0.7)
        }
        .buttonStyle(.plain)
        .disabled(!unlocked)
    }

    private var reminderCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: $remindersOn) {
                Label("不定时剧场邀请", systemImage: "bell.badge.fill")
            }
            Text("开启后，每天会在随机时间收到一次剧场邀请，用学过的单词演一段，记得更牢。复习提醒会一直按遗忘曲线发送。")
                .font(.footnote).foregroundStyle(.secondary)
        }
        .card()
        .onChange(of: remindersOn) { _, _ in NotificationService.refresh(progress: progress) }
    }
}
