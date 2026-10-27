import SwiftUI
import SwiftData
import Charts

struct ReviewHomeView: View {
    @Query(sort: \WordProgress.nextReview) private var progress: [WordProgress]

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 30)) { ctx in
                let now = ctx.date
                let due = progress.filter { $0.nextReview <= now }
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        dueCard(due)
                        if !progress.isEmpty {
                            forecast(now: now)
                            curveCard
                            wordList(now: now)
                        }
                    }
                    .padding()
                    .readableWidth(900)
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("复习")
        }
    }

    // MARK: 待复习

    @ViewBuilder
    private func dueCard(_ due: [WordProgress]) -> some View {
        VStack(spacing: 14) {
            if progress.isEmpty {
                Text("📚").font(.system(size: 60))
                Text("还没有学过的单词").font(.title3.bold())
                Text("先去「学习」页学一课，5 分钟后就能来复习了").foregroundStyle(.secondary)
            } else if due.isEmpty {
                Text("✅").font(.system(size: 60))
                Text("太棒了，暂时没有要复习的单词").font(.title3.bold())
                if let next = progress.first {
                    Text("下一次复习：\(next.nextReview.relativeCN)").foregroundStyle(.secondary)
                }
                NavigationLink {
                    ReviewSessionView(wordIDs: weakest(), early: true)
                } label: {
                    Label("提前练习最薄弱的单词", systemImage: "bolt.fill")
                }
                .buttonStyle(PrimaryButtonStyle(color: .teal))
            } else {
                Text("\(due.count)").font(.system(size: 64, weight: .bold, design: .rounded)).foregroundStyle(.orange)
                Text("个单词到了复习时间").font(.title3.bold())
                Text("趁还没忘记，带着当初的场景巩固一下").foregroundStyle(.secondary)
                NavigationLink {
                    ReviewSessionView(wordIDs: due.map(\.wordID).shuffled(), early: false)
                } label: {
                    Label("开始复习", systemImage: "play.fill")
                }
                .buttonStyle(PrimaryButtonStyle(color: .orange))
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .card(padding: 24)
    }

    private func weakest() -> [String] {
        progress.sorted { ($0.stage, $1.lapseCount) < ($1.stage, $0.lapseCount) }
            .prefix(10).map(\.wordID).shuffled()
    }

    // MARK: 未来 7 天

    private struct DayCount: Identifiable { let id: Int; let label: String; let count: Int }

    private func forecast(now: Date) -> some View {
        let cal = Calendar.current
        let today = cal.startOfDay(for: now)
        let days: [DayCount] = (0..<7).map { i in
            let start = cal.date(byAdding: .day, value: i, to: today)!
            let end = cal.date(byAdding: .day, value: 1, to: start)!
            let count = progress.filter { i == 0 ? $0.nextReview < end : ($0.nextReview >= start && $0.nextReview < end) }.count
            let label = i == 0 ? "今天" : (i == 1 ? "明天" : start.formatted(.dateTime.weekday(.abbreviated).locale(Locale(identifier: "zh_CN"))))
            return DayCount(id: i, label: label, count: count)
        }
        return VStack(alignment: .leading, spacing: 10) {
            Text("未来 7 天复习量").font(.headline)
            Chart(days) { d in
                BarMark(x: .value("日期", d.label), y: .value("单词", d.count))
                    .foregroundStyle(d.id == 0 ? Color.orange.gradient : Color.indigo.gradient)
                    .annotation(position: .top) {
                        if d.count > 0 { Text("\(d.count)").font(.caption2).foregroundStyle(.secondary) }
                    }
            }
            .chartYAxis(.hidden)
            .frame(height: 150)
        }
        .card()
    }

    // MARK: 遗忘曲线说明

    private var curveCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("艾宾浩斯复习节奏", systemImage: "chart.line.downtrend.xyaxis").font(.headline)
            Text("记住了 → 进入下一个间隔；有点模糊 → 原间隔再来一次；忘记了 → 从头开始。")
                .font(.footnote).foregroundStyle(.secondary)
            FlowLayout(spacing: 6) {
                ForEach(Array(Ebbinghaus.labels.enumerated()), id: \.offset) { i, label in
                    HStack(spacing: 4) {
                        Text(label).font(.caption.bold())
                        Text("· \(progress.filter { $0.stage == i }.count)词").font(.caption2).foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 8).padding(.vertical, 5)
                    .background(Color.indigo.opacity(0.06 + Double(i) * 0.04), in: Capsule())
                }
                Text("已掌握 · \(progress.filter(\.isMastered).count)词")
                    .font(.caption.bold())
                    .padding(.horizontal, 8).padding(.vertical, 5)
                    .background(Color.green.opacity(0.2), in: Capsule())
            }
        }
        .card()
    }

    // MARK: 单词列表

    private func wordList(now: Date) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("我的单词本（\(progress.count)）").font(.headline).padding(.bottom, 8)
            ForEach(progress) { p in
                if let w = p.word {
                    HStack(spacing: 12) {
                        Text(w.emoji).font(.title2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(w.text).font(.body.weight(.semibold))
                            Text(w.meaning).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            StageDots(stage: p.stage)
                            Text(p.nextReview <= now ? "待复习" : p.nextReview.relativeCN)
                                .font(.caption2)
                                .foregroundStyle(p.nextReview <= now ? Color.orange : Color.secondary)
                        }
                        SpeakButton(text: w.text, size: 14)
                    }
                    .padding(.vertical, 8)
                    Divider()
                }
            }
        }
        .card()
    }
}

struct StageDots: View {
    let stage: Int
    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<Ebbinghaus.intervals.count, id: \.self) { i in
                Circle()
                    .fill(i < stage ? Color.green : Color.gray.opacity(0.25))
                    .frame(width: 6, height: 6)
            }
        }
    }
}
