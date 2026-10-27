import XCTest
@testable import WordBuddy

/// 词库与场景数据完整性
final class ContentTests: XCTestCase {

    func testUnitAndWordCounts() {
        XCTAssertEqual(Content.units.count, 6)
        XCTAssertEqual(Content.allScenes.count, 12)
        XCTAssertEqual(Content.allWords.count, 48)
    }

    func testWordIDsAreUniqueAndLowercase() {
        XCTAssertEqual(Set(Content.allWords.map(\.id)).count, Content.allWords.count, "存在重复单词")
        for w in Content.allWords {
            XCTAssertEqual(w.id, w.id.lowercased(), "\(w.id) 应为小写")
            XCTAssertFalse(w.id.contains(" "), "\(w.id) 不应包含空格")
        }
    }

    func testSceneIDsAreUnique() {
        XCTAssertEqual(Set(Content.allScenes.map(\.id)).count, Content.allScenes.count)
    }

    func testEveryWordAppearsInItsScene() {
        for scene in Content.allScenes {
            for w in scene.words {
                XCTAssertFalse(scene.lines(containing: w.id).isEmpty,
                               "单词 \(w.id) 没有出现在场景「\(scene.title)」的台词中")
            }
        }
    }

    func testWordFieldsAreComplete() {
        for w in Content.allWords {
            XCTAssertTrue(w.phonetic.hasPrefix("/") && w.phonetic.hasSuffix("/"), "\(w.id) 音标格式错误：\(w.phonetic)")
            XCTAssertFalse(w.meaning.isEmpty, "\(w.id) 缺少中文释义")
            XCTAssertFalse(w.pos.isEmpty, "\(w.id) 缺少词性")
            XCTAssertFalse(w.emoji.isEmpty, "\(w.id) 缺少 emoji")
        }
    }

    func testScenesAreShortAndBeginnerFriendly() {
        for scene in Content.allScenes {
            XCTAssertEqual(scene.words.count, 4, "「\(scene.title)」应包含 4 个单词")
            XCTAssertTrue((4...7).contains(scene.lines.count), "「\(scene.title)」台词数 \(scene.lines.count) 不在 4–7 之间")
            XCTAssertTrue(scene.lines.indices.contains(scene.keyLine), "「\(scene.title)」keyLine 越界")
            for line in scene.lines {
                let wordCount = line.en.split(separator: " ").count
                XCTAssertLessThanOrEqual(wordCount, 12, "句子过长：\(line.en)")
                XCTAssertFalse(line.zh.isEmpty, "缺少翻译：\(line.en)")
            }
        }
    }

    func testDialogueScenesHaveSpeakersAndStoriesHaveNarration() {
        for scene in Content.allScenes {
            switch scene.kind {
            case .dialogue: XCTAssertGreaterThanOrEqual(scene.speakers.count, 2, "对话「\(scene.title)」至少需要 2 个角色")
            case .story: XCTAssertTrue(scene.lines.contains { $0.speaker == nil }, "故事「\(scene.title)」应有旁白")
            }
        }
    }

    func testLookupTables() {
        for scene in Content.allScenes {
            XCTAssertEqual(Content.sceneByID[scene.id]?.id, scene.id)
            for w in scene.words { XCTAssertEqual(Content.sceneByWordID[w.id]?.id, scene.id) }
        }
    }

    func testVoiceIndexIsStablePerSpeaker() {
        let scene = Content.sceneByID["s1"]!
        XCTAssertEqual(scene.speakers, ["Mom", "Tom"])
        XCTAssertEqual(scene.voiceIndex(for: "Mom"), 0)
        XCTAssertEqual(scene.voiceIndex(for: "Tom"), 1)
        XCTAssertEqual(scene.voiceIndex(for: nil), 0)
    }
}
