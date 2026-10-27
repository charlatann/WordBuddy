import SwiftUI

// MARK: - 卡片样式

struct CardModifier: ViewModifier {
    var padding: CGFloat = 16
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .shadow(color: .black.opacity(0.05), radius: 6, y: 2)
    }
}

extension View {
    func card(padding: CGFloat = 16) -> some View { modifier(CardModifier(padding: padding)) }

    /// iPad 上限制内容宽度，居中显示
    func readableWidth(_ max: CGFloat = 820) -> some View {
        frame(maxWidth: max).frame(maxWidth: .infinity)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var color: Color = .indigo
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(color.opacity(configuration.isPressed ? 0.75 : 1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

// MARK: - 发音按钮

struct SpeakButton: View {
    let text: String
    var slow = false
    var voiceIndex = 0
    var size: CGFloat = 20
    @ObservedObject private var speaker = Speaker.shared

    var body: some View {
        Button {
            speaker.speak(text, slow: slow, voiceIndex: voiceIndex)
        } label: {
            Image(systemName: slow ? "tortoise.fill" : "speaker.wave.2.fill")
                .font(.system(size: size, weight: .semibold))
                .symbolEffect(.variableColor.iterative, isActive: speaker.speakingText == text && speaker.isSpeaking)
                .foregroundStyle(.indigo)
                .frame(width: size * 2.2, height: size * 2.2)
                .background(Color.indigo.opacity(0.12), in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(slow ? "慢速朗读" : "朗读")
    }
}

// MARK: - 单词小标签

struct WordChip: View {
    let word: Word
    var learned = false
    var body: some View {
        HStack(spacing: 4) {
            Text(word.emoji)
            Text(word.text).fontWeight(.medium)
            if learned { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).font(.caption) }
        }
        .font(.subheadline)
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Color.indigo.opacity(0.08), in: Capsule())
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, width: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > maxWidth { x = 0; y += rowH + spacing; rowH = 0 }
            x += s.width + spacing
            rowH = max(rowH, s.height)
            width = max(width, x - spacing)
        }
        return CGSize(width: width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
    }
}

// MARK: - 分数圆环

struct ScoreRing: View {
    let score: Int
    var color: Color
    var size: CGFloat = 110

    var body: some View {
        ZStack {
            Circle().stroke(color.opacity(0.15), lineWidth: size * 0.1)
            Circle()
                .trim(from: 0, to: CGFloat(score) / 100)
                .stroke(color, style: StrokeStyle(lineWidth: size * 0.1, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(score)").font(.system(size: size * 0.32, weight: .bold, design: .rounded))
                Text("分").font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(width: size, height: size)
        .animation(.spring(duration: 0.8), value: score)
    }
}

// MARK: - 台词气泡

struct LineBubble: View {
    let line: SceneLine
    let highlight: [String]
    var alignRight = false
    var showChinese = true
    var voiceIndex = 0
    @ObservedObject private var speaker = Speaker.shared

    private var isPlaying: Bool { speaker.isSpeaking && speaker.speakingText == line.en }

    var body: some View {
        if line.speaker == nil {
            // 旁白
            VStack(spacing: 4) {
                Text(TextTools.highlighted(line.en, words: highlight)).font(.body)
                if showChinese { Text(line.zh).font(.footnote).foregroundStyle(.secondary) }
            }
            .multilineTextAlignment(.center)
            .padding(12)
            .frame(maxWidth: .infinity)
            .background(Color.yellow.opacity(isPlaying ? 0.25 : 0.12), in: RoundedRectangle(cornerRadius: 14))
            .contentShape(Rectangle())
            .onTapGesture { speaker.speak(line.en, voiceIndex: voiceIndex) }
        } else {
            HStack(alignment: .top) {
                if alignRight { Spacer(minLength: 40) }
                VStack(alignment: alignRight ? .trailing : .leading, spacing: 4) {
                    Text(line.speaker ?? "").font(.caption.bold()).foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(TextTools.highlighted(line.en, words: highlight))
                        if showChinese { Text(line.zh).font(.footnote).foregroundStyle(.secondary) }
                    }
                    .padding(12)
                    .background(
                        (alignRight ? Color.indigo.opacity(0.14) : Color(.tertiarySystemGroupedBackground)),
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.indigo, lineWidth: isPlaying ? 2 : 0))
                }
                if !alignRight { Spacer(minLength: 40) }
            }
            .contentShape(Rectangle())
            .onTapGesture { speaker.speak(line.en, voiceIndex: voiceIndex) }
        }
    }
}

// MARK: - 场景播放器（学习和复习共用）

struct ScenePlayerView: View {
    let scene: LearningScene
    var highlight: [String]? = nil
    @State private var showChinese = true
    @ObservedObject private var speaker = Speaker.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("\(scene.emoji) \(scene.title)").font(.title3.bold())
                Text(scene.kind.rawValue)
                    .font(.caption).padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color.orange.opacity(0.15), in: Capsule())
                Spacer()
                Button(showChinese ? "隐藏中文" : "显示中文") { showChinese.toggle() }
                    .font(.footnote)
            }
            ForEach(Array(scene.lines.enumerated()), id: \.offset) { _, line in
                let vi = scene.voiceIndex(for: line.speaker)
                LineBubble(line: line, highlight: highlight ?? scene.wordIDs,
                           alignRight: vi % 2 == 1, showChinese: showChinese, voiceIndex: vi)
            }
            HStack {
                Button {
                    if speaker.isSpeaking { speaker.stop(); return }
                    for (i, line) in scene.lines.enumerated() {
                        speaker.speak(line.en, voiceIndex: scene.voiceIndex(for: line.speaker), enqueue: i > 0)
                    }
                } label: {
                    Label(speaker.isSpeaking ? "停止" : "播放全部", systemImage: speaker.isSpeaking ? "stop.fill" : "play.fill")
                }
                .buttonStyle(.borderedProminent)
                Spacer()
                Text("点击任意一句可单独播放").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}
