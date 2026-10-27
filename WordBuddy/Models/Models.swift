import Foundation
import SwiftData

// MARK: - 静态学习内容

struct Word: Identifiable, Hashable {
    let id: String          // 英文单词本身（小写）
    let phonetic: String    // 音标
    let pos: String         // 词性
    let meaning: String     // 中文释义
    let emoji: String
    var text: String { id }
}

struct SceneLine: Hashable {
    let speaker: String?    // nil 表示旁白
    let en: String
    let zh: String
}

struct LearningScene: Identifiable, Hashable {
    enum Kind: String, Hashable { case dialogue = "对话", story = "小故事" }

    let id: String
    let title: String
    let emoji: String
    let kind: Kind
    let words: [Word]
    let lines: [SceneLine]
    let keyLine: Int        // 本场景的“日常用语”句子

    var keyPhrase: SceneLine { lines[keyLine] }
    var wordIDs: [String] { words.map(\.id) }

    /// 场景中出现过的说话人（按出场顺序），用于给不同角色分配不同声音
    var speakers: [String] {
        var seen: [String] = []
        for l in lines { if let s = l.speaker, !seen.contains(s) { seen.append(s) } }
        return seen
    }

    func voiceIndex(for speaker: String?) -> Int {
        guard let speaker, let i = speakers.firstIndex(of: speaker) else { return 0 }
        return i
    }

    func lines(containing word: String) -> [SceneLine] {
        lines.filter { TextTools.contains($0.en, word: word) }
    }
}

struct LearningUnit: Identifiable {
    let id: Int
    let title: String
    let emoji: String
    let scenes: [LearningScene]
}

// MARK: - 持久化数据（SwiftData）

@Model
final class WordProgress {
    @Attribute(.unique) var wordID: String
    var sceneID: String
    var stage: Int               // 已成功复习的次数，对应遗忘曲线的第几个间隔
    var learnedAt: Date
    var nextReview: Date
    var lastReviewed: Date?
    var reviewCount: Int
    var lapseCount: Int
    var bestScore: Int?

    init(wordID: String, sceneID: String, now: Date = .now) {
        self.wordID = wordID
        self.sceneID = sceneID
        self.stage = 0
        self.learnedAt = now
        self.nextReview = now.addingTimeInterval(Ebbinghaus.interval(for: 0))
        self.lastReviewed = nil
        self.reviewCount = 0
        self.lapseCount = 0
        self.bestScore = nil
    }

    var word: Word? { Content.wordByID[wordID] }
    var scene: LearningScene? { Content.sceneByID[sceneID] }
    var isMastered: Bool { stage >= Ebbinghaus.intervals.count }
}

@Model
final class PracticeRecord {
    var id: UUID
    var text: String
    var score: Int
    var date: Date
    var audioFileName: String?

    init(text: String, score: Int, audioFileName: String?, date: Date = .now) {
        self.id = UUID()
        self.text = text
        self.score = score
        self.date = date
        self.audioFileName = audioFileName
    }
}

// MARK: - 艾宾浩斯遗忘曲线复习计划

enum ReviewGrade { case forgot, hard, good }

enum Ebbinghaus {
    /// 学习后第 1 次复习 5 分钟，之后 30 分钟、12 小时、1、2、4、7、15、30 天
    static let intervals: [TimeInterval] = [
        5 * 60, 30 * 60, 12 * 3600,
        1 * 86400, 2 * 86400, 4 * 86400, 7 * 86400, 15 * 86400, 30 * 86400
    ]
    static let labels = ["5分钟", "30分钟", "12小时", "1天", "2天", "4天", "7天", "15天", "30天"]
    static let masteredInterval: TimeInterval = 60 * 86400

    static func interval(for stage: Int) -> TimeInterval {
        stage < intervals.count ? intervals[max(0, stage)] : masteredInterval
    }

    /// - 记住了：进入下一个间隔
    /// - 有点模糊：保持当前间隔再巩固一次
    /// - 忘记了：回到起点重新开始曲线
    static func apply(_ grade: ReviewGrade, to p: WordProgress, early: Bool = false, now: Date = .now) {
        p.reviewCount += 1
        p.lastReviewed = now
        if early && grade != .forgot { return }   // 提前复习不推进计划
        switch grade {
        case .good: p.stage += 1
        case .hard: break
        case .forgot:
            p.stage = 0
            p.lapseCount += 1
        }
        p.nextReview = now.addingTimeInterval(interval(for: p.stage))
    }

    static func stageLabel(_ stage: Int) -> String {
        stage >= intervals.count ? "已掌握" : "第\(stage + 1)轮 · 间隔\(labels[stage])"
    }
}
