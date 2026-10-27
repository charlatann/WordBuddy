import Foundation
import UserNotifications

/// 本地通知：
/// 1. 复习提醒 —— 按遗忘曲线到期时间提醒（只在 8:00–22:00 之间打扰）
/// 2. 剧场邀请 —— 未来几天每天随机一个时间，邀请用户用学过的词玩一段互动短剧
enum NotificationService {
    static let storyRemindersKey = "storyReminders"

    static func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    static func refresh(progress: [WordProgress]) {
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()
        let now = Date()
        let cal = Calendar.current

        center.setBadgeCount(progress.filter { $0.nextReview <= now }.count) { _ in }

        // 复习提醒：把相近的到期时间合并，最多排 8 条
        var times: [Date] = []
        for t in progress.map(\.nextReview).filter({ $0 > now }).sorted() {
            let adjusted = daytime(t, cal: cal)
            if let last = times.last, adjusted.timeIntervalSince(last) < 2 * 3600 { continue }
            times.append(adjusted)
            if times.count >= 8 { break }
        }
        for (i, t) in times.enumerated() {
            let due = progress.filter { $0.nextReview <= t }
            guard !due.isEmpty else { continue }
            let sample = due.compactMap(\.word).shuffled().prefix(3).map(\.text).joined(separator: "、")
            let content = UNMutableNotificationContent()
            content.title = "🧠 复习时间到"
            content.body = "\(due.count) 个单词快要忘记啦（\(sample)…），花 2 分钟巩固一下吧！"
            content.sound = .default
            content.userInfo = ["tab": "review"]
            schedule(id: "review-\(i)", content: content, at: t, cal: cal)
        }

        // 剧场邀请：未来 5 天，每天 10:00–20:00 之间随机一次
        let enabled = UserDefaults.standard.object(forKey: storyRemindersKey) as? Bool ?? true
        let learned = progress.compactMap(\.word)
        guard enabled, learned.count >= 3 else { return }
        let messages: [(String, String)] = [
            ("🎭 剧场开演啦", "波波用你学过的「%@」写了一出小剧，就差你来接戏！"),
            ("🎲 随机小剧场", "今天的短剧里藏着单词「%@」，你还记得它的意思吗？"),
            ("🎬 你有一个新角色", "台词里有「%@」，来演一段，顺便练练发音吧！"),
        ]
        for day in 1...5 {
            guard let base = cal.date(byAdding: .day, value: day, to: cal.startOfDay(for: now)),
                  let t = cal.date(bySettingHour: Int.random(in: 10...19), minute: Int.random(in: 0...59), second: 0, of: base),
                  let msg = messages.randomElement(), let word = learned.randomElement() else { continue }
            let content = UNMutableNotificationContent()
            content.title = msg.0
            content.body = String(format: msg.1, word.text)
            content.sound = .default
            content.userInfo = ["tab": "story"]
            schedule(id: "story-\(day)", content: content, at: t, cal: cal)
        }
    }

    private static func daytime(_ date: Date, cal: Calendar) -> Date {
        let hour = cal.component(.hour, from: date)
        if hour < 8 { return cal.date(bySettingHour: 8, minute: 0, second: 0, of: date) ?? date }
        if hour >= 22, let next = cal.date(byAdding: .day, value: 1, to: date) {
            return cal.date(bySettingHour: 8, minute: 0, second: 0, of: next) ?? date
        }
        return date
    }

    private static func schedule(id: String, content: UNNotificationContent, at date: Date, cal: Calendar) {
        let comps = cal.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
}
