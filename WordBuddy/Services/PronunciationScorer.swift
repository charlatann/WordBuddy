import Foundation
import Speech
import SwiftUI

struct WordResult: Identifiable, Hashable {
    let id = UUID()
    let text: String
    let matched: Bool
}

struct PronunciationResult: Hashable {
    let score: Int          // 0...100
    let accuracy: Double    // 读对的单词比例
    let clarity: Double     // 识别置信度（发音清晰程度）
    let fluency: Double     // 语速与停顿
    let recognized: String
    let words: [WordResult]

    var title: String {
        switch score {
        case 90...: return "太棒了，接近母语！"
        case 75..<90: return "很好，继续保持！"
        case 60..<75: return "不错，再练练会更好"
        case 40..<60: return "加油，多听几遍标准音"
        default: return "没太听清，再试一次吧"
        }
    }
    var emoji: String {
        switch score {
        case 90...: return "🌟"
        case 75..<90: return "👍"
        case 60..<75: return "🙂"
        case 40..<60: return "💪"
        default: return "🎧"
        }
    }
    var color: Color {
        switch score {
        case 75...: return .green
        case 50..<75: return .orange
        default: return .red
        }
    }
}

enum ScoringError: LocalizedError {
    case notAuthorized, unavailable, nothingHeard, failed(String)

    var errorDescription: String? {
        switch self {
        case .notAuthorized: return "请在「设置 › 单词伙伴」中允许语音识别，才能为发音打分"
        case .unavailable: return "语音识别暂不可用，请检查网络或稍后再试"
        case .nothingHeard: return "没有听到声音，靠近麦克风再试一次"
        case .failed(let m): return "分析失败：\(m)"
        }
    }
}

/// 发音打分：用 Apple 语音识别把录音转成文字，与目标句子逐词对齐。
/// 综合分 = 准确度 60% + 清晰度 30% + 流利度 10%
enum PronunciationScorer {
    private static let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))

    static func requestAuthorization() async -> Bool {
        if SFSpeechRecognizer.authorizationStatus() == .authorized { return true }
        return await withCheckedContinuation { c in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) }
        }
    }

    static func score(audio url: URL, expected: String) async throws -> PronunciationResult {
        guard await requestAuthorization() else { throw ScoringError.notAuthorized }
        guard let recognizer, recognizer.isAvailable else { throw ScoringError.unavailable }

        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = false
        request.taskHint = .dictation
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }

        let result: SFSpeechRecognitionResult = try await withCheckedThrowingContinuation { cont in
            var resumed = false
            _ = recognizer.recognitionTask(with: request) { result, error in
                guard !resumed else { return }
                if let result, result.isFinal {
                    resumed = true
                    cont.resume(returning: result)
                } else if let error {
                    resumed = true
                    let code = (error as NSError).code
                    // 1110: No speech detected
                    cont.resume(throwing: code == 1110 ? ScoringError.nothingHeard
                                                       : ScoringError.failed(error.localizedDescription))
                }
            }
        }
        return evaluate(result: result, expected: expected)
    }

    // MARK: - 评分逻辑

    private struct Spoken { let token: String; let confidence: Float; let start: TimeInterval; let end: TimeInterval }

    static func evaluate(result: SFSpeechRecognitionResult, expected: String) -> PronunciationResult {
        let display = expected.components(separatedBy: " ").filter { !$0.isEmpty }
        let normalized = display.map(normalize)
        let scoredIdx = normalized.indices.filter { !normalized[$0].isEmpty }
        let target = scoredIdx.map { normalized[$0] }

        // 在最多 3 个候选识别结果里选最匹配的；非首选结果打 85 折，避免“放水”
        var best: (acc: Double, matched: [Bool], spoken: [Spoken], text: String, spokenMatched: [Bool])?
        for (rank, t) in result.transcriptions.prefix(3).enumerated() {
            let spoken = t.segments.flatMap { seg -> [Spoken] in
                seg.substring.components(separatedBy: " ").map(normalize).filter { !$0.isEmpty }.map {
                    Spoken(token: $0, confidence: seg.confidence, start: seg.timestamp, end: seg.timestamp + seg.duration)
                }
            }
            let (a, b) = align(target, spoken.map(\.token))
            var acc = target.isEmpty ? 0 : Double(a.filter { $0 }.count) / Double(target.count)
            if rank > 0 { acc *= 0.85 }
            if best == nil || acc > best!.acc {
                best = (acc, a, spoken, t.formattedString, b)
            }
        }
        guard let best else {
            return PronunciationResult(score: 0, accuracy: 0, clarity: 0, fluency: 0, recognized: "",
                                       words: display.map { WordResult(text: $0, matched: false) })
        }

        // 每个展示单词是否读对
        var matchedByDisplay = Array(repeating: true, count: display.count)
        for (k, idx) in scoredIdx.enumerated() { matchedByDisplay[idx] = best.matched[k] }
        let words = display.indices.map { WordResult(text: display[$0], matched: matchedByDisplay[$0]) }

        // 清晰度：读对单词的平均识别置信度
        let confs = best.spoken.indices.filter { best.spokenMatched[$0] }.map { Double(best.spoken[$0].confidence) }
        let clarity: Double
        if confs.isEmpty { clarity = 0 }
        else {
            let avg = confs.reduce(0, +) / Double(confs.count)
            clarity = avg > 0 ? avg : best.acc          // 某些设备不返回置信度时退化为准确度
        }

        // 流利度：语速（每秒 1~3.5 个词为佳）和最长停顿
        var fluency = best.acc > 0 ? 1.0 : 0
        if best.spoken.count >= 2, let first = best.spoken.first, let last = best.spoken.last {
            let span = max(0.3, last.end - first.start)
            let wps = Double(best.spoken.count) / span
            if wps < 1.0 { fluency *= max(0.3, wps) }
            if wps > 4.0 { fluency *= max(0.5, 4.0 / wps) }
            var maxGap: TimeInterval = 0
            for i in 1..<best.spoken.count { maxGap = max(maxGap, best.spoken[i].start - best.spoken[i - 1].end) }
            if maxGap > 1.2 { fluency *= 0.7 }
        }

        return PronunciationResult(score: combinedScore(accuracy: best.acc, clarity: clarity, fluency: fluency),
                                   accuracy: best.acc, clarity: clarity,
                                   fluency: fluency, recognized: best.text, words: words)
    }

    /// 综合分 = 准确度 60% + 清晰度 30% + 流利度 10%；一个词都没读对时最多 10 分
    static func combinedScore(accuracy: Double, clarity: Double, fluency: Double) -> Int {
        var score = 100 * (0.6 * accuracy + 0.3 * clarity + 0.1 * fluency)
        if accuracy == 0 { score = min(score, 10) }
        return Int(max(0, min(100, score)).rounded())
    }

    private static let numberWords: [String: String] = [
        "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
        "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10", "eleven": "11",
        "twelve": "12", "thirteen": "13", "fourteen": "14", "fifteen": "15", "sixteen": "16",
        "seventeen": "17", "eighteen": "18", "nineteen": "19", "twenty": "20",
    ]

    static func normalize(_ s: String) -> String {
        let t = s.lowercased().filter { $0.isLetter || $0.isNumber }
        if let d = numberWords[t] { return d }
        if t == "okay" { return "ok" }
        return t
    }

    private static func same(_ a: String, _ b: String) -> Bool {
        a == b || (a.count >= 5 && levenshtein(a, b) <= 1)
    }

    /// 最长公共子序列对齐，返回两边各自哪些词被匹配
    static func align(_ a: [String], _ b: [String]) -> ([Bool], [Bool]) {
        let n = a.count, m = b.count
        var am = Array(repeating: false, count: n), bm = Array(repeating: false, count: m)
        guard n > 0, m > 0 else { return (am, bm) }
        var dp = Array(repeating: Array(repeating: 0, count: m + 1), count: n + 1)
        for i in stride(from: n - 1, through: 0, by: -1) {
            for j in stride(from: m - 1, through: 0, by: -1) {
                dp[i][j] = same(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : max(dp[i + 1][j], dp[i][j + 1])
            }
        }
        var i = 0, j = 0
        while i < n && j < m {
            if same(a[i], b[j]) { am[i] = true; bm[j] = true; i += 1; j += 1 }
            else if dp[i + 1][j] >= dp[i][j + 1] { i += 1 }
            else { j += 1 }
        }
        return (am, bm)
    }

    private static func levenshtein(_ a: String, _ b: String) -> Int {
        let a = Array(a), b = Array(b)
        var prev = Array(0...b.count)
        for i in 1...max(1, a.count) where !a.isEmpty {
            var cur = [i] + Array(repeating: 0, count: b.count)
            for j in 1...max(1, b.count) where !b.isEmpty {
                cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1))
            }
            prev = cur
        }
        return prev[b.count]
    }
}
