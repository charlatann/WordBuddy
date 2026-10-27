import SwiftUI

enum TextTools {
    private static let suffixes = ["", "s", "es", "ed", "d", "ing"]

    /// 句子里的某个词是否是目标单词（含简单变形：waits / sleeps 等）
    static func tokenMatches(_ token: String, word: String) -> Bool {
        let t = token.lowercased().filter(\.isLetter)
        return suffixes.contains { t == word + $0 }
    }

    static func contains(_ sentence: String, word: String) -> Bool {
        sentence.components(separatedBy: " ").contains { tokenMatches($0, word: word) }
    }

    /// 把目标单词高亮显示
    static func highlighted(_ sentence: String, words: [String], color: Color = .indigo) -> AttributedString {
        var result = AttributedString()
        let tokens = sentence.components(separatedBy: " ")
        for (i, tok) in tokens.enumerated() {
            var part = AttributedString(tok)
            if words.contains(where: { tokenMatches(tok, word: $0) }) {
                part.foregroundColor = color
                part.inlinePresentationIntent = .stronglyEmphasized
            }
            result += part
            if i < tokens.count - 1 { result += AttributedString(" ") }
        }
        return result
    }

    /// 挖空目标单词（保留标点）
    static func blank(_ sentence: String, word: String) -> String {
        var done = false
        return sentence.components(separatedBy: " ").map { tok -> String in
            guard !done, tokenMatches(tok, word: word) else { return tok }
            done = true
            let lead = String(tok.prefix { !$0.isLetter })
            let trail = String(String(tok.reversed()).prefix { !$0.isLetter }.reversed())
            return lead + "_____" + trail
        }.joined(separator: " ")
    }
}

extension Date {
    /// “5分钟后” / “3天后” / “现在”
    var relativeCN: String {
        let diff = timeIntervalSinceNow
        if diff <= 0 { return "现在" }
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "zh_CN")
        f.unitsStyle = .short
        return f.localizedString(for: self, relativeTo: .now)
    }
}
