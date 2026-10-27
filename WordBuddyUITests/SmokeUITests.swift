import XCTest

/// 冒烟测试：启动 App、切换 4 个 Tab、走一遍学习流程的前半段
final class SmokeUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-uiTesting"]
        app.launch()
    }

    private func button(containing text: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    private func screenshot(_ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    func testLaunchAndSwitchTabs() {
        XCTAssertTrue(app.navigationBars["学新词"].waitForExistence(timeout: 10), "首页未显示")
        screenshot("01-学习首页")

        let tabs: [(String, String)] = [("复习", "复习"), ("剧场", "互动剧场"), ("发音", "发音练习"), ("学习", "学新词")]
        for (tab, title) in tabs {
            app.buttons[tab].firstMatch.tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5), "切换到「\(tab)」失败")
            screenshot("tab-\(tab)")
        }
    }

    func testFirstLessonFlow() {
        XCTAssertTrue(app.navigationBars["学新词"].waitForExistence(timeout: 10))
        let lesson = app.buttons.matching(NSPredicate(format: "label CONTAINS '迟到的早晨'")).firstMatch
        XCTAssertTrue(lesson.waitForExistence(timeout: 5))
        lesson.tap()

        // 认识 4 个新单词
        XCTAssertTrue(app.staticTexts["morning"].waitForExistence(timeout: 5), "第一个单词未显示")
        screenshot("02-单词卡")
        for _ in 0..<3 { app.buttons["下一个"].tap() }
        app.buttons["进入场景 ▶︎"].tap()

        // 场景页
        XCTAssertTrue(app.buttons["播放全部"].waitForExistence(timeout: 5), "场景页未显示")
        XCTAssertTrue(app.staticTexts["今日日常用语"].exists)
        screenshot("03-场景")

        // 进入小测
        app.swipeUp()
        app.buttons["小测验 ▶︎"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH '听一听'")).firstMatch.waitForExistence(timeout: 5))
        screenshot("04-小测验")
    }

    func testPronunciationScreenOpens() {
        app.buttons["发音"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["发音练习"].waitForExistence(timeout: 5))
        app.buttons.matching(NSPredicate(format: "label CONTAINS 'morning'")).firstMatch.tap()
        XCTAssertTrue(app.navigationBars["跟读打分"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["开始录音"].exists, "缺少录音按钮")
        screenshot("05-跟读打分")
    }
}
