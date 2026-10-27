import XCTest
@testable import WordBuddy

/// 艾宾浩斯遗忘曲线复习计划
final class EbbinghausTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeProgress() -> WordProgress {
        WordProgress(wordID: "coffee", sceneID: "s1", now: now)
    }

    func testIntervalsMatchSpec() {
        XCTAssertEqual(Ebbinghaus.intervals, [300, 1800, 43_200, 86_400, 172_800, 345_600, 604_800, 1_296_000, 2_592_000])
        XCTAssertEqual(Ebbinghaus.labels.count, Ebbinghaus.intervals.count)
        XCTAssertEqual(Ebbinghaus.intervals, Ebbinghaus.intervals.sorted(), "间隔应递增")
    }

    func testNewWordIsDueAfterFiveMinutes() {
        let p = makeProgress()
        XCTAssertEqual(p.stage, 0)
        XCTAssertEqual(p.nextReview.timeIntervalSince(now), 5 * 60)
        XCTAssertEqual(p.reviewCount, 0)
        XCTAssertNotNil(p.word)
        XCTAssertNotNil(p.scene)
    }

    func testGoodWalksThroughEveryInterval() {
        let p = makeProgress()
        var t = now
        for stage in 1..<Ebbinghaus.intervals.count {
            t = t.addingTimeInterval(1000)
            Ebbinghaus.apply(.good, to: p, now: t)
            XCTAssertEqual(p.stage, stage)
            XCTAssertEqual(p.nextReview.timeIntervalSince(t), Ebbinghaus.intervals[stage], accuracy: 0.001)
        }
        XCTAssertFalse(p.isMastered)
        Ebbinghaus.apply(.good, to: p, now: t)
        XCTAssertTrue(p.isMastered)
        XCTAssertEqual(p.nextReview.timeIntervalSince(t), Ebbinghaus.masteredInterval, accuracy: 0.001)
        XCTAssertEqual(p.reviewCount, Ebbinghaus.intervals.count)
    }

    func testHardKeepsCurrentInterval() {
        let p = makeProgress()
        Ebbinghaus.apply(.good, to: p, now: now)
        Ebbinghaus.apply(.good, to: p, now: now)   // stage 2 = 12 小时
        Ebbinghaus.apply(.hard, to: p, now: now)
        XCTAssertEqual(p.stage, 2)
        XCTAssertEqual(p.nextReview.timeIntervalSince(now), 12 * 3600)
        XCTAssertEqual(p.lapseCount, 0)
    }

    func testForgotRestartsCurve() {
        let p = makeProgress()
        for _ in 0..<5 { Ebbinghaus.apply(.good, to: p, now: now) }
        Ebbinghaus.apply(.forgot, to: p, now: now)
        XCTAssertEqual(p.stage, 0)
        XCTAssertEqual(p.lapseCount, 1)
        XCTAssertEqual(p.nextReview.timeIntervalSince(now), 5 * 60)
        XCTAssertEqual(p.lastReviewed, now)
    }

    func testEarlyReviewDoesNotAdvanceSchedule() {
        let p = makeProgress()
        let originalNext = p.nextReview
        Ebbinghaus.apply(.good, to: p, early: true, now: now)
        Ebbinghaus.apply(.hard, to: p, early: true, now: now)
        XCTAssertEqual(p.stage, 0)
        XCTAssertEqual(p.nextReview, originalNext)
        XCTAssertEqual(p.reviewCount, 2, "提前复习也应计入复习次数")
    }

    func testEarlyReviewForgotStillResets() {
        let p = makeProgress()
        for _ in 0..<3 { Ebbinghaus.apply(.good, to: p, now: now) }
        Ebbinghaus.apply(.forgot, to: p, early: true, now: now)
        XCTAssertEqual(p.stage, 0)
        XCTAssertEqual(p.lapseCount, 1)
    }

    func testStageLabels() {
        XCTAssertEqual(Ebbinghaus.stageLabel(0), "第1轮 · 间隔5分钟")
        XCTAssertEqual(Ebbinghaus.stageLabel(99), "已掌握")
        XCTAssertEqual(Ebbinghaus.interval(for: -3), 300, "负数阶段应按 0 处理")
    }
}
