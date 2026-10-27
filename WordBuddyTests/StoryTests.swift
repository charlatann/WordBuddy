import XCTest
import SwiftData
@testable import WordBuddy

/// 互动短剧：预置剧本数据 + 随机生成器
@MainActor
final class StoryTests: XCTestCase {
    private var container: ModelContainer!

    override func setUp() async throws {
        container = try ModelContainer(for: WordProgress.self, PracticeRecord.self,
                                       configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    }

    private func learned(_ ids: [String]) -> [WordProgress] {
        ids.map { id in
            let p = WordProgress(wordID: id, sceneID: Content.sceneByWordID[id]!.id)
            container.mainContext.insert(p)
            return p
        }
    }

    private func checkFill(_ step: StoryStep, file: StaticString = #filePath, line: UInt = #line) {
        guard case let .fill(_, en, _, answer, options) = step else { return }
        XCTAssertTrue(TextTools.contains(en, word: answer), "答案 \(answer) 不在句子中：\(en)", file: file, line: line)
        XCTAssertTrue(options.contains(answer), "选项缺少答案 \(answer)", file: file, line: line)
        XCTAssertEqual(options.count, 4, "选项应为 4 个：\(options)", file: file, line: line)
        XCTAssertEqual(Set(options).count, options.count, "选项重复：\(options)", file: file, line: line)
        XCTAssertNotEqual(TextTools.blank(en, word: answer), en, "挖空失败：\(en)", file: file, line: line)
        for o in options where o != answer {
            XCTAssertFalse(TextTools.contains(en, word: o), "干扰项 \(o) 也出现在句子中，会造成歧义：\(en)", file: file, line: line)
        }
    }

    // MARK: 预置短剧

    func testCuratedStoriesUseKnownWords() {
        XCTAssertEqual(StoryLibrary.curated.count, 3)
        XCTAssertEqual(Set(StoryLibrary.curated.map(\.id)).count, 3)
        for story in StoryLibrary.curated {
            for id in story.wordIDs { XCTAssertNotNil(Content.wordByID[id], "「\(story.title)」使用了词库中不存在的单词 \(id)") }
        }
    }

    func testCuratedFillStepsAreValid() {
        for story in StoryLibrary.curated {
            for step in story.steps {
                checkFill(step)
                if case let .fill(_, _, _, answer, options) = step {
                    for o in options { XCTAssertNotNil(Content.wordByID[o], "「\(story.title)」选项 \(o) 不在词库中") }
                    XCTAssertTrue(story.wordIDs.contains(answer), "「\(story.title)」填空答案 \(answer) 不在解锁词表中")
                }
            }
        }
    }

    func testCuratedStoriesHaveSpeakingAndFillSteps() {
        for story in StoryLibrary.curated {
            XCTAssertTrue(story.steps.contains { if case .speak = $0 { return true }; return false }, "「\(story.title)」缺少开口说环节")
            let fills = story.steps.filter { if case .fill = $0 { return true }; return false }.count
            XCTAssertGreaterThanOrEqual(fills, 4, "「\(story.title)」填空太少")
            if case .line = story.steps.first! {} else { XCTFail("「\(story.title)」应以台词/旁白开场") }
        }
    }

    // MARK: 随机小剧场

    func testRemixNeedsAtLeastThreeWords() {
        XCTAssertNil(StoryGenerator.remix(from: []))
        XCTAssertNil(StoryGenerator.remix(from: learned(["coffee", "late"])))
    }

    func testRemixWithThreeWordsPadsOptions() throws {
        let story = try XCTUnwrap(StoryGenerator.remix(from: learned(["coffee", "late", "hurry"])))
        XCTAssertTrue(story.isRemix)
        XCTAssertEqual(Set(story.wordIDs), ["coffee", "late", "hurry"])
        story.steps.forEach { checkFill($0) }
    }

    func testRemixIsAlwaysValidAcrossManyRuns() throws {
        let all = learned(Content.allWords.map(\.id))
        for _ in 0..<100 {
            let story = try XCTUnwrap(StoryGenerator.remix(from: all))
            XCTAssertLessThanOrEqual(story.wordIDs.count, 5)
            XCTAssertEqual(Set(story.wordIDs).count, story.wordIDs.count, "同一段剧里单词重复")
            story.steps.forEach { checkFill($0) }
            let fills = story.steps.filter { if case .fill = $0 { return true }; return false }.count
            XCTAssertEqual(fills, story.wordIDs.count, "每个出演单词应有一个填空")
            let speaks = story.steps.filter { if case .speak = $0 { return true }; return false }.count
            XCTAssertEqual(speaks, 1)
            if case .line = story.steps.last! {} else { XCTFail("应以谢幕旁白结束") }
        }
    }

    func testRemixPrioritizesDueWords() throws {
        let all = learned(Content.allWords.map(\.id))
        let past = Date().addingTimeInterval(-3600)
        let future = Date().addingTimeInterval(86_400 * 10)
        let dueIDs: Set = ["cat", "snow", "menu", "map", "egg"]
        for p in all {
            p.stage = 3
            p.nextReview = dueIDs.contains(p.wordID) ? past : future
        }
        for _ in 0..<20 {
            let story = try XCTUnwrap(StoryGenerator.remix(from: all))
            XCTAssertEqual(Set(story.wordIDs), dueIDs, "到期单词应被优先安排进剧情")
        }
    }
}
