import XCTest
@testable import WordBuddy

/// 文本工具：单词匹配、高亮、挖空
final class TextToolsTests: XCTestCase {

    func testTokenMatchesWordForms() {
        XCTAssertTrue(TextTools.tokenMatches("waits.", word: "wait"))
        XCTAssertTrue(TextTools.tokenMatches("sleeps", word: "sleep"))
        XCTAssertTrue(TextTools.tokenMatches("Morning,", word: "morning"))
        XCTAssertTrue(TextTools.tokenMatches("...Water!", word: "water"))
        XCTAssertTrue(TextTools.tokenMatches("hurrying", word: "hurry"))
        XCTAssertFalse(TextTools.tokenMatches("snowman", word: "snow"))
        XCTAssertFalse(TextTools.tokenMatches("catch", word: "cat"))
    }

    func testContains() {
        XCTAssertTrue(TextTools.contains("He waits. And waits.", word: "wait"))
        XCTAssertFalse(TextTools.contains("Tim makes a snowman.", word: "snow"))
    }

    func testBlankKeepsPunctuationAndOnlyFirstOccurrence() {
        XCTAssertEqual(TextTools.blank("I'm late! I have to hurry!", word: "late"), "I'm _____! I have to hurry!")
        XCTAssertEqual(TextTools.blank("...Water! Water, please!", word: "water"), "..._____! Water, please!")
        XCTAssertEqual(TextTools.blank("No match here.", word: "cake"), "No match here.")
    }

    func testHighlightKeepsOriginalText() {
        let s = "Hurry, hurry! And Tom... that's my coffee."
        let attr = TextTools.highlighted(s, words: ["hurry", "coffee"])
        XCTAssertEqual(String(attr.characters), s)
        let emphasized = attr.runs.filter { $0.inlinePresentationIntent == .stronglyEmphasized }
            .map { String(attr[$0.range].characters) }
        XCTAssertEqual(emphasized, ["Hurry,", "hurry!", "coffee."])
    }
}

/// 发音评分算法（不依赖麦克风的纯逻辑部分）
final class ScoringTests: XCTestCase {

    func testNormalize() {
        XCTAssertEqual(PronunciationScorer.normalize("It's"), "its")
        XCTAssertEqual(PronunciationScorer.normalize("8:30."), "830")
        XCTAssertEqual(PronunciationScorer.normalize("One"), "1")
        XCTAssertEqual(PronunciationScorer.normalize("sixteen"), "16")
        XCTAssertEqual(PronunciationScorer.normalize("Okay"), "ok")
        XCTAssertEqual(PronunciationScorer.normalize("...Water!"), "water")
        XCTAssertEqual(PronunciationScorer.normalize("—"), "")
    }

    func testAlignPerfect() {
        let (a, b) = PronunciationScorer.align(["i", "have", "to", "hurry"], ["i", "have", "to", "hurry"])
        XCTAssertEqual(a, [true, true, true, true])
        XCTAssertEqual(b, [true, true, true, true])
    }

    func testAlignMissingAndExtraWords() {
        let (a, b) = PronunciationScorer.align(["i", "have", "to", "hurry"], ["uh", "i", "to", "hurt"])
        XCTAssertEqual(a, [true, false, true, false])
        XCTAssertEqual(b, [false, true, true, false])
    }

    func testAlignFuzzyForLongWords() {
        let (a, _) = PronunciationScorer.align(["jacket"], ["jackets"])
        XCTAssertEqual(a, [true], "长单词允许 1 个字母差异")
        let (c, _) = PronunciationScorer.align(["pay"], ["pie"])
        XCTAssertEqual(c, [false], "短单词必须完全一致")
    }

    func testAlignEmptyInputs() {
        XCTAssertEqual(PronunciationScorer.align([], ["a"]).0, [])
        XCTAssertEqual(PronunciationScorer.align(["a"], []).0, [false])
    }

    func testCombinedScore() {
        XCTAssertEqual(PronunciationScorer.combinedScore(accuracy: 1, clarity: 1, fluency: 1), 100)
        XCTAssertEqual(PronunciationScorer.combinedScore(accuracy: 0.5, clarity: 0.8, fluency: 1), 64)
        XCTAssertLessThanOrEqual(PronunciationScorer.combinedScore(accuracy: 0, clarity: 1, fluency: 1), 10)
        XCTAssertEqual(PronunciationScorer.combinedScore(accuracy: 2, clarity: 2, fluency: 2), 100, "分数不应超过 100")
    }

    func testResultLevels() {
        func result(_ s: Int) -> PronunciationResult {
            PronunciationResult(score: s, accuracy: 0, clarity: 0, fluency: 0, recognized: "", words: [])
        }
        XCTAssertEqual(result(95).emoji, "🌟")
        XCTAssertEqual(result(80).emoji, "👍")
        XCTAssertEqual(result(65).emoji, "🙂")
        XCTAssertEqual(result(45).emoji, "💪")
        XCTAssertEqual(result(10).emoji, "🎧")
        XCTAssertEqual(result(75).color, .green)
        XCTAssertEqual(result(60).color, .orange)
        XCTAssertEqual(result(20).color, .red)
    }

    func testEveryPracticeSentenceIsScorable() {
        // 所有可练习的句子归一化后都应至少有一个可评分的词
        for line in Content.allScenes.flatMap(\.lines) {
            let tokens = line.en.split(separator: " ").map { PronunciationScorer.normalize(String($0)) }.filter { !$0.isEmpty }
            XCTAssertFalse(tokens.isEmpty, "无法评分的句子：\(line.en)")
        }
    }
}

/// 通知时段
final class NotificationTimeTests: XCTestCase {
    private let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Riyadh")!
        return c
    }()

    private func date(_ d: Int, _ h: Int, _ m: Int = 0) -> Date {
        cal.date(from: DateComponents(year: 2026, month: 10, day: d, hour: h, minute: m))!
    }

    func testNightTimeMovesToEightAM() {
        XCTAssertEqual(NotificationService.daytime(date(27, 3), cal: cal), date(27, 8))
        XCTAssertEqual(NotificationService.daytime(date(27, 23, 30), cal: cal), date(28, 8))
    }

    func testDaytimeUnchanged() {
        XCTAssertEqual(NotificationService.daytime(date(27, 14, 15), cal: cal), date(27, 14, 15))
        XCTAssertEqual(NotificationService.daytime(date(27, 8), cal: cal), date(27, 8))
    }
}
