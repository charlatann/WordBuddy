import Foundation

// 初级词库：6 个单元 × 2 个场景 × 4 个单词 = 48 个高频词。
// 每个场景都是一段简短、有反转笑点的对话或小故事，单词都在场景中出现。
// 想扩充词库，只需照格式在 units 里继续添加。

private func w(_ id: String, _ ph: String, _ pos: String, _ zh: String, _ emoji: String) -> Word {
    Word(id: id, phonetic: ph, pos: pos, meaning: zh, emoji: emoji)
}
private func l(_ speaker: String, _ en: String, _ zh: String) -> SceneLine {
    SceneLine(speaker: speaker, en: en, zh: zh)
}
private func n(_ en: String, _ zh: String) -> SceneLine {
    SceneLine(speaker: nil, en: en, zh: zh)
}

enum Content {
    static let units: [LearningUnit] = [
        LearningUnit(id: 1, title: "美好的早晨", emoji: "🌅", scenes: [
            LearningScene(
                id: "s1", title: "迟到的早晨", emoji: "⏰", kind: .dialogue,
                words: [
                    w("morning", "/ˈmɔːrnɪŋ/", "n.", "早晨", "🌅"),
                    w("coffee", "/ˈkɔːfi/", "n.", "咖啡", "☕️"),
                    w("late", "/leɪt/", "adj.", "迟到的；晚的", "🐌"),
                    w("hurry", "/ˈhɜːri/", "v.", "赶快；匆忙", "🏃"),
                ],
                lines: [
                    l("Mom", "Good morning, Tom!", "早上好，汤姆！"),
                    l("Tom", "Morning, Mom... Where is my coffee?", "早，妈妈……我的咖啡呢？"),
                    l("Mom", "Your coffee? It's 8:30. You're late!", "你的咖啡？已经8点半了。你迟到了！"),
                    l("Tom", "Oh no! I have to hurry!", "糟了！我得赶紧了！"),
                    l("Mom", "Hurry, hurry! And Tom... that's my coffee.", "快点快点！还有汤姆……那是我的咖啡。"),
                ],
                keyLine: 3),
            LearningScene(
                id: "s2", title: "鸡蛋的烦恼", emoji: "🥚", kind: .story,
                words: [
                    w("hungry", "/ˈhʌŋɡri/", "adj.", "饥饿的", "😋"),
                    w("breakfast", "/ˈbrekfəst/", "n.", "早餐", "🍳"),
                    w("egg", "/eɡ/", "n.", "鸡蛋", "🥚"),
                    w("delicious", "/dɪˈlɪʃəs/", "adj.", "美味的", "🤤"),
                ],
                lines: [
                    n("Sam is very hungry.", "山姆非常饿。"),
                    n("He wants an egg for breakfast.", "他早餐想吃一个鸡蛋。"),
                    n("He opens the fridge. One egg! Yes!", "他打开冰箱。一个鸡蛋！太好了！"),
                    n("The egg falls. Oh no...", "鸡蛋掉了。哦不……"),
                    n("Now his dog has a delicious breakfast.", "现在他的狗吃上了一顿美味的早餐。"),
                ],
                keyLine: 0),
        ]),
        LearningUnit(id: 2, title: "去购物", emoji: "🛍️", scenes: [
            LearningScene(
                id: "s3", title: "太便宜了？", emoji: "🎩", kind: .dialogue,
                words: [
                    w("shop", "/ʃɑːp/", "n.", "商店", "🏪"),
                    w("buy", "/baɪ/", "v.", "买", "💳"),
                    w("price", "/praɪs/", "n.", "价格", "🏷️"),
                    w("cheap", "/tʃiːp/", "adj.", "便宜的", "🪙"),
                ],
                lines: [
                    l("Amy", "Look at this shop!", "看这家店！"),
                    l("Ben", "I want to buy this hat. What's the price?", "我想买这顶帽子。多少钱？"),
                    l("Clerk", "One dollar.", "一美元。"),
                    l("Ben", "Wow, so cheap!", "哇，好便宜！"),
                    l("Clerk", "Sorry, one dollar... for the box.", "抱歉，一美元……是盒子的价格。"),
                ],
                keyLine: 1),
            LearningScene(
                id: "s4", title: "完美的尺码", emoji: "👗", kind: .dialogue,
                words: [
                    w("try", "/traɪ/", "v.", "试；尝试", "🤔"),
                    w("size", "/saɪz/", "n.", "尺码；大小", "📏"),
                    w("small", "/smɔːl/", "adj.", "小的", "🐭"),
                    w("perfect", "/ˈpɜːrfɪkt/", "adj.", "完美的", "💯"),
                ],
                lines: [
                    l("Lily", "Can I try this dress?", "我可以试穿这条裙子吗？"),
                    l("Clerk", "Sure! What size?", "当然！什么尺码？"),
                    l("Lily", "Small, please.", "请给我小号。"),
                    l("Lily", "Hmm, it's a little small...", "嗯，有点小……"),
                    l("Clerk", "No, no. It's perfect!", "不不，它很完美！"),
                    l("Lily", "But I can't breathe!", "可是我喘不过气了！"),
                ],
                keyLine: 0),
        ]),
        LearningUnit(id: 3, title: "在餐厅", emoji: "🍜", scenes: [
            LearningScene(
                id: "s5", title: "超级辣", emoji: "🌶️", kind: .dialogue,
                words: [
                    w("menu", "/ˈmenjuː/", "n.", "菜单", "📋"),
                    w("order", "/ˈɔːrdər/", "v.", "点餐；订购", "🙋"),
                    w("spicy", "/ˈspaɪsi/", "adj.", "辣的", "🌶️"),
                    w("water", "/ˈwɔːtər/", "n.", "水", "💧"),
                ],
                lines: [
                    l("Waiter", "Here is the menu.", "这是菜单。"),
                    l("Jack", "Can I order the chicken?", "我可以点鸡肉吗？"),
                    l("Waiter", "It's very spicy.", "它非常辣。"),
                    l("Jack", "No problem! I love spicy food.", "没问题！我爱吃辣。"),
                    l("Jack", "...Water! Water, please!", "……水！请给我水！"),
                ],
                keyLine: 1),
            LearningScene(
                id: "s6", title: "谁来买单", emoji: "🧾", kind: .dialogue,
                words: [
                    w("full", "/fʊl/", "adj.", "饱的；满的", "😮‍💨"),
                    w("cake", "/keɪk/", "n.", "蛋糕", "🍰"),
                    w("bill", "/bɪl/", "n.", "账单", "🧾"),
                    w("pay", "/peɪ/", "v.", "付钱", "💵"),
                ],
                lines: [
                    l("Leo", "I'm so full.", "我好饱。"),
                    l("Mia", "Me too. But... cake?", "我也是。不过……蛋糕？"),
                    l("Leo", "Yes, cake!", "好，来蛋糕！"),
                    l("Waiter", "Here is your bill.", "这是你们的账单。"),
                    l("Mia", "Who will pay?", "谁来付钱？"),
                    l("Leo", "Oh, look! A bird!", "哦，快看！一只鸟！"),
                ],
                keyLine: 3),
        ]),
        LearningUnit(id: 4, title: "出门在外", emoji: "🚌", scenes: [
            LearningScene(
                id: "s7", title: "等公交", emoji: "🚏", kind: .story,
                words: [
                    w("bus", "/bʌs/", "n.", "公交车", "🚌"),
                    w("stop", "/stɑːp/", "n.", "车站；停止", "🚏"),
                    w("wait", "/weɪt/", "v.", "等待", "⏳"),
                    w("ticket", "/ˈtɪkɪt/", "n.", "票", "🎫"),
                ],
                lines: [
                    n("Ken is at the bus stop.", "肯在公交车站。"),
                    n("He waits. And waits.", "他等啊等。"),
                    n("The bus comes! He looks for his ticket.", "公交来了！他找自己的车票。"),
                    n("Where is my ticket?!", "我的票在哪儿？！"),
                    n("The bus goes. Ken waits again.", "公交开走了。肯又开始等。"),
                ],
                keyLine: 0),
            LearningScene(
                id: "s8", title: "迷路了", emoji: "🗺️", kind: .dialogue,
                words: [
                    w("lost", "/lɔːst/", "adj.", "迷路的", "😵‍💫"),
                    w("map", "/mæp/", "n.", "地图", "🗺️"),
                    w("left", "/left/", "n./adv.", "左边；向左", "⬅️"),
                    w("right", "/raɪt/", "n./adv.", "右边；向右", "➡️"),
                ],
                lines: [
                    l("Tourist", "Excuse me, I'm lost.", "打扰一下，我迷路了。"),
                    l("Man", "Do you have a map?", "你有地图吗？"),
                    l("Tourist", "Yes, here.", "有，在这儿。"),
                    l("Man", "Go left, then right, then left...", "先左转，再右转，再左转……"),
                    l("Tourist", "Left, right, left?", "左、右、左？"),
                    l("Man", "Wait. This map is Paris. You're in London!", "等等，这是巴黎的地图。你在伦敦！"),
                ],
                keyLine: 0),
        ]),
        LearningUnit(id: 5, title: "悠闲周末", emoji: "🛋️", scenes: [
            LearningScene(
                id: "s9", title: "周末计划", emoji: "🎬", kind: .dialogue,
                words: [
                    w("weekend", "/ˈwiːkend/", "n.", "周末", "📅"),
                    w("movie", "/ˈmuːvi/", "n.", "电影", "🎬"),
                    w("friend", "/frend/", "n.", "朋友", "🤝"),
                    w("fun", "/fʌn/", "adj./n.", "有趣的；乐趣", "🎉"),
                ],
                lines: [
                    l("Anna", "What's your plan this weekend?", "这周末你有什么计划？"),
                    l("Max", "A movie with my friend.", "和朋友去看电影。"),
                    l("Anna", "Fun! Which friend?", "真好玩！哪个朋友？"),
                    l("Max", "You!", "你呀！"),
                    l("Anna", "Me? OK... you buy the popcorn.", "我？好吧……你买爆米花。"),
                ],
                keyLine: 0),
            LearningScene(
                id: "s10", title: "懒猫麻薯", emoji: "🐱", kind: .story,
                words: [
                    w("cat", "/kæt/", "n.", "猫", "🐱"),
                    w("sofa", "/ˈsoʊfə/", "n.", "沙发", "🛋️"),
                    w("sleep", "/sliːp/", "v.", "睡觉", "😴"),
                    w("lazy", "/ˈleɪzi/", "adj.", "懒惰的", "🦥"),
                ],
                lines: [
                    n("This is my cat, Mochi.", "这是我的猫，麻薯。"),
                    n("She loves the sofa.", "她最爱沙发。"),
                    n("She sleeps 16 hours a day.", "她每天睡16个小时。"),
                    n("Is she lazy? Yes.", "她懒吗？是的。"),
                    n("Am I lazy? Well... I'm on the sofa too.", "我懒吗？嗯……我也在沙发上。"),
                ],
                keyLine: 1),
        ]),
        LearningUnit(id: 6, title: "天气变变变", emoji: "🌦️", scenes: [
            LearningScene(
                id: "s11", title: "爸爸的伞", emoji: "☂️", kind: .dialogue,
                words: [
                    w("hot", "/hɑːt/", "adj.", "热的", "🥵"),
                    w("umbrella", "/ʌmˈbrelə/", "n.", "雨伞", "☂️"),
                    w("rain", "/reɪn/", "n./v.", "雨；下雨", "🌧️"),
                    w("wet", "/wet/", "adj.", "湿的", "💦"),
                ],
                lines: [
                    l("Zoe", "It's so hot today!", "今天好热！"),
                    l("Dad", "Take an umbrella. It will rain.", "带把伞，要下雨了。"),
                    l("Zoe", "No way!", "不可能！"),
                    l("Zoe", "Dad... I'm wet.", "爸……我湿透了。"),
                    l("Dad", "I know. The umbrella is in my hand.", "我知道。伞在我手里呢。"),
                ],
                keyLine: 1),
            LearningScene(
                id: "s12", title: "雪人的夹克", emoji: "⛄️", kind: .story,
                words: [
                    w("cold", "/koʊld/", "adj.", "冷的", "🥶"),
                    w("snow", "/snoʊ/", "n.", "雪", "❄️"),
                    w("jacket", "/ˈdʒækɪt/", "n.", "夹克；外套", "🧥"),
                    w("warm", "/wɔːrm/", "adj.", "温暖的", "🔥"),
                ],
                lines: [
                    n("It's cold. Look, snow!", "好冷。看，下雪了！"),
                    n("Tim makes a snowman.", "蒂姆堆了一个雪人。"),
                    n("The snowman looks cold.", "雪人看起来很冷。"),
                    n("Tim gives it his jacket.", "蒂姆把夹克给了它。"),
                    n("Now the snowman is warm. Tim is not.", "现在雪人暖和了，蒂姆却冻坏了。"),
                ],
                keyLine: 0),
        ]),
    ]

    static let allScenes: [LearningScene] = units.flatMap(\.scenes)
    static let allWords: [Word] = allScenes.flatMap(\.words)
    static let wordByID: [String: Word] = Dictionary(uniqueKeysWithValues: allWords.map { ($0.id, $0) })
    static let sceneByID: [String: LearningScene] = Dictionary(uniqueKeysWithValues: allScenes.map { ($0.id, $0) })
    static let sceneByWordID: [String: LearningScene] = {
        var map: [String: LearningScene] = [:]
        for s in allScenes { for w in s.words { map[w.id] = s } }
        return map
    }()
}
