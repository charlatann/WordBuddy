import Foundation

// MARK: - 互动短剧

enum StoryStep: Hashable {
    /// 旁白或角色台词（自动朗读）
    case line(speaker: String?, en: String, zh: String)
    /// 选词填空：en 中包含 answer，展示时挖空
    case fill(speaker: String?, en: String, zh: String, answer: String, options: [String])
    /// 用户开口说台词，现场打分
    case speak(en: String, zh: String)
}

struct InteractiveStory: Identifiable, Hashable {
    let id: String
    let title: String
    let emoji: String
    let intro: String
    let wordIDs: [String]
    let steps: [StoryStep]
    var isRemix = false

    var speakers: [String] {
        var seen: [String] = []
        for s in steps {
            switch s {
            case .line(let sp, _, _), .fill(let sp, _, _, _, _):
                if let sp, !seen.contains(sp) { seen.append(sp) }
            case .speak: break
            }
        }
        return seen
    }

    func voiceIndex(for speaker: String?) -> Int {
        guard let speaker, let i = speakers.firstIndex(of: speaker) else { return 0 }
        return i + 1
    }
}

// MARK: - 预置短剧（学完对应单词后解锁）

enum StoryLibrary {
    static let curated: [InteractiveStory] = [
        InteractiveStory(
            id: "d1", title: "手忙脚乱的周一", emoji: "😱",
            intro: "里奥睡过头了……帮他完成这个兵荒马乱的早晨！",
            wordIDs: ["morning", "late", "hurry", "hungry", "coffee", "bus", "stop", "ticket"],
            steps: [
                .line(speaker: nil, en: "It's Monday morning. Leo opens his eyes.", zh: "周一早上，里奥睁开了眼睛。"),
                .line(speaker: "Leo", en: "What time is it? Oh no, 8:50!", zh: "几点了？糟糕，8点50！"),
                .fill(speaker: "Leo", en: "I'm late! I have to hurry!", zh: "我迟到了！我得赶快！",
                      answer: "late", options: ["late", "cheap", "wet", "spicy"]),
                .line(speaker: nil, en: "No time for breakfast. No time for coffee.", zh: "没时间吃早餐，也没时间喝咖啡。"),
                .fill(speaker: "Leo", en: "I'm so hungry...", zh: "我好饿……",
                      answer: "hungry", options: ["hungry", "perfect", "cheap", "spicy"]),
                .line(speaker: nil, en: "He runs to the bus stop.", zh: "他跑向公交车站。"),
                .fill(speaker: "Driver", en: "Ticket, please!", zh: "请出示车票！",
                      answer: "ticket", options: ["ticket", "menu", "sofa", "umbrella"]),
                .speak(en: "I have to hurry!", zh: "我得赶快！"),
                .line(speaker: nil, en: "At the office, his boss looks surprised.", zh: "到了公司，老板一脸惊讶。"),
                .line(speaker: "Boss", en: "Leo, why are you here? It's a holiday today!", zh: "里奥，你来干嘛？今天放假！"),
                .fill(speaker: "Leo", en: "A holiday? Then... coffee time!", zh: "放假？那么……咖啡时间！",
                      answer: "coffee", options: ["coffee", "bus", "snow", "price"]),
            ]),
        InteractiveStory(
            id: "d2", title: "餐厅大冒险", emoji: "🔥",
            intro: "山姆非要挑战“火焰面”，结果……",
            wordIDs: ["friend", "menu", "order", "spicy", "water", "delicious", "bill", "pay"],
            steps: [
                .line(speaker: nil, en: "Ella and her friend Sam go to a new restaurant.", zh: "艾拉和朋友山姆去了一家新餐厅。"),
                .line(speaker: "Waiter", en: "Hello! Here is the menu.", zh: "你好！这是菜单。"),
                .fill(speaker: "Sam", en: "Can I order the fire noodles?", zh: "我可以点火焰面吗？",
                      answer: "order", options: ["order", "sleep", "rain", "snow"]),
                .line(speaker: "Waiter", en: "They are very, very spicy.", zh: "它们非常、非常辣。"),
                .line(speaker: "Sam", en: "No problem. I love spicy food!", zh: "没问题，我最爱吃辣！"),
                .line(speaker: nil, en: "Sam eats one bite. His face is red.", zh: "山姆吃了一口，脸瞬间通红。"),
                .fill(speaker: "Sam", en: "Water! Water, please!", zh: "水！请给我水！",
                      answer: "water", options: ["water", "map", "sofa", "ticket"]),
                .speak(en: "Water, please!", zh: "请给我水！"),
                .fill(speaker: "Ella", en: "Hmm, my soup is delicious.", zh: "嗯，我的汤真好喝。",
                      answer: "delicious", options: ["delicious", "lost", "late", "wet"]),
                .line(speaker: "Waiter", en: "Here is your bill.", zh: "这是你们的账单。"),
                .fill(speaker: "Sam", en: "Ella, you pay. You are my best friend!", zh: "艾拉，你付钱吧。你是我最好的朋友！",
                      answer: "pay", options: ["pay", "snow", "rain", "sleep"]),
                .line(speaker: "Ella", en: "Best friend? OK... next time, you pay!", zh: "最好的朋友？好吧……下次你付！"),
            ]),
        InteractiveStory(
            id: "d3", title: "雨天大甩卖", emoji: "☔️",
            intro: "米娅出门没带伞，偏偏下起了大雨……",
            wordIDs: ["rain", "umbrella", "wet", "cold", "shop", "cheap", "buy", "jacket", "warm"],
            steps: [
                .line(speaker: nil, en: "It's a cold, grey day. Mia walks to the shop.", zh: "阴冷的一天，米娅走向商店。"),
                .fill(speaker: nil, en: "Oh no, it starts to rain!", zh: "哦不，开始下雨了！",
                      answer: "rain", options: ["rain", "order", "pay", "buy"]),
                .line(speaker: "Mia", en: "I don't have an umbrella!", zh: "我没带伞！"),
                .fill(speaker: "Mia", en: "Now I'm wet and cold.", zh: "现在我又湿又冷。",
                      answer: "wet", options: ["wet", "full", "cheap", "delicious"]),
                .line(speaker: nil, en: "She runs into the shop.", zh: "她跑进了商店。"),
                .line(speaker: "Clerk", en: "Big sale today! Everything is cheap!", zh: "今天大甩卖！样样都便宜！"),
                .fill(speaker: "Mia", en: "I want to buy an umbrella and a jacket.", zh: "我想买一把伞和一件夹克。",
                      answer: "buy", options: ["buy", "sleep", "wait", "hurry"]),
                .speak(en: "I want to buy an umbrella.", zh: "我想买一把伞。"),
                .fill(speaker: "Mia", en: "This jacket is so warm. I love it!", zh: "这件夹克好暖和，我好喜欢！",
                      answer: "warm", options: ["warm", "late", "lost", "hungry"]),
                .line(speaker: nil, en: "She walks out. The rain stops. The sun comes out.", zh: "她走出商店。雨停了，太阳出来了。"),
                .line(speaker: "Mia", en: "...Of course.", zh: "……果然如此。"),
            ]),
    ]
}

// MARK: - 根据已学单词即时生成“随机小剧场”

enum StoryGenerator {
    private static let intros: [(String, String)] = [
        ("Welcome to Memory Theater! Tonight's show is made of YOUR words.", "欢迎来到记忆剧场！今晚的演出全部由你的单词组成。"),
        ("Bobo the robot finds an old diary. Let's read it together!", "机器人波波找到一本旧日记，我们一起读读吧！"),
        ("Bobo the robot has a strange dream. Everyone in it speaks English!", "机器人波波做了个怪梦，梦里每个人都说英语！"),
    ]
    private static let outros: [(String, String)] = [
        ("The curtain falls. Bobo says: \"Great job!\"", "大幕落下，波波说：“干得漂亮！”"),
        ("Bobo closes the diary and smiles.", "波波合上日记，笑了。"),
        ("Bobo wakes up. \"What a dream!\"", "波波醒了过来：“好奇妙的梦！”"),
    ]

    /// - Parameters:
    ///   - learned: 已学单词的进度（优先挑选到期、阶段较低的词）
    static func remix(from learned: [WordProgress], maxWords: Int = 5) -> InteractiveStory? {
        let now = Date()
        let candidates = learned
            .compactMap { p -> (Word, LearningScene, Double)? in
                guard let w = p.word, let s = p.scene else { return nil }
                var weight = Double.random(in: 0..<1)
                if p.nextReview <= now { weight += 2 }
                weight += Double(max(0, 4 - p.stage)) * 0.3
                return (w, s, weight)
            }
            .sorted { $0.2 > $1.2 }
        guard candidates.count >= 3 else { return nil }

        let picked = Array(candidates.prefix(maxWords))
        let learnedWords = candidates.map(\.0.id)
        let pick = intros.randomElement()!
        var steps: [StoryStep] = [.line(speaker: nil, en: pick.0, zh: pick.1)]
        var speakAdded = false

        for (i, item) in picked.enumerated() {
            let (word, scene, _) = item
            let sentences = scene.lines(containing: word.id)
            guard let target = sentences.randomElement() else { continue }
            steps.append(.line(speaker: nil, en: "Scene \(i + 1)!", zh: "第\(i + 1)幕：\(scene.emoji) \(scene.title)"))
            // 填空前给一句上文，帮助回忆场景
            if let idx = scene.lines.firstIndex(of: target), idx > 0 {
                let prev = scene.lines[idx - 1]
                steps.append(.line(speaker: prev.speaker, en: prev.en, zh: prev.zh))
            }
            steps.append(.fill(speaker: target.speaker, en: target.en, zh: target.zh,
                               answer: word.id,
                               options: distractors(for: word.id, sentence: target.en, pool: learnedWords)))
            if !speakAdded && i >= 1 {
                steps.append(.speak(en: target.en, zh: target.zh))
                speakAdded = true
            }
        }
        let end = outros.randomElement()!
        steps.append(.line(speaker: nil, en: end.0, zh: end.1))

        return InteractiveStory(
            id: UUID().uuidString, title: "随机小剧场", emoji: "🎲",
            intro: "由你学过的 \(picked.count) 个单词即兴生成",
            wordIDs: picked.map(\.0.id), steps: steps, isRemix: true)
    }

    private static func distractors(for answer: String, sentence: String, pool: [String]) -> [String] {
        var options = [answer]
        let usable = pool.filter { $0 != answer && !TextTools.contains(sentence, word: $0) }.shuffled()
        options += usable.prefix(3)
        if options.count < 4 {
            let extra = Content.allWords.map(\.id)
                .filter { !options.contains($0) && !TextTools.contains(sentence, word: $0) }
                .shuffled()
            options += extra.prefix(4 - options.count)
        }
        return options
    }
}
