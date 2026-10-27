# 单词伙伴 WordBuddy

面向英语初学者的 iPhone / iPad 通用 App（SwiftUI + SwiftData，iOS 17+）。
学初级词汇和日常用语，用遗忘曲线复习，用互动短剧巩固，用录音打分练口语。

## 运行

```bash
brew install xcodegen
cd WordBuddy
xcodegen generate        # 生成 WordBuddy.xcodeproj
open WordBuddy.xcodeproj
```

在 Xcode 里选择你的开发者 Team（Signing & Capabilities），然后运行到 iPhone/iPad。
**录音和语音识别请用真机测试**，模拟器的麦克风和识别效果不稳定。

## 四大功能

| Tab | 功能 | 实现要点 |
|---|---|---|
| 📖 学习 | 新单词学习 | 6 单元 × 2 场景 × 4 词 = 48 个高频词。每课：认识单词（音标/释义/emoji/标准音/慢速）→ 有反转笑点的短对话或小故事（不同角色不同声音，点句播放）→ 今日日常用语 → 听音选义小测 → 加入复习计划 |
| 🔁 复习 | 艾宾浩斯复习 | 间隔：5分钟 → 30分钟 → 12小时 → 1天 → 2天 → 4天 → 7天 → 15天 → 30天 → 已掌握。复习卡片展示**当初学习的场景句子**，可一键回看完整场景。记住了 / 有点模糊 / 忘记了 三档自评；未来 7 天复习量图表 |
| 🎭 剧场 | 开放式学习 | ① 随机小剧场：根据已学单词即时生成互动短剧，优先挑快到期、阶段低的词；② 3 部预置短剧，学完对应单词解锁。玩法：台词自动朗读、选词填空、开口说台词打分。表现会反馈到复习计划。每天随机时间推送剧场邀请（可关闭） |
| 🎙️ 发音 | 发音练习 | 单词 / 日常用语 / 我的进步。录音 → 回放 → 打分（0–100），逐词标绿/标红，显示识别结果；“对比听”先放标准音再放自己的录音；历史分数曲线和录音回放 |

## 发音评分原理

用 Apple `Speech` 框架（优先设备端识别）把录音转写成文字，与目标句子逐词做最长公共子序列对齐：

- 准确度 60%：目标单词中被正确识别的比例
- 清晰度 30%：读对单词的识别置信度
- 流利度 10%：语速和最长停顿

这是“能被听懂程度”的近似，不是音素级评测。若要音素级打分（哪个音发错了），可接入商业语音评测 SDK（如微软 Azure Pronunciation Assessment、科大讯飞、声通等），替换 `PronunciationScorer.score` 即可，界面无需改动。

## 目录结构

```
WordBuddy/
├── App/WordBuddyApp.swift          入口、Tab、通知点击跳转
├── Models/
│   ├── Models.swift                单词/场景结构、SwiftData 模型、遗忘曲线算法
│   ├── Content.swift               48 词 + 12 个场景（在这里扩充词库）
│   └── Stories.swift               预置短剧 + 随机短剧生成器
├── Services/
│   ├── Speaker.swift               TTS 标准发音（多角色声音、慢速、排队）
│   ├── AudioRecorder.swift         录音与回放
│   ├── PronunciationScorer.swift   识别 + 评分
│   ├── NotificationService.swift   复习提醒 + 随机剧场邀请
│   └── TextTools.swift             高亮、挖空等文本工具
└── Views/ Learn · Review · Story · Speak · Common
```

## 扩充内容

- **加词库**：在 `Content.swift` 的 `units` 里照格式加 `LearningUnit` / `LearningScene`，单词必须出现在场景台词里（自动高亮、自动用于复习和随机剧场）。
- **加短剧**：在 `Stories.swift` 的 `StoryLibrary.curated` 里加，`wordIDs` 决定解锁条件。

## 上架前待办

- 添加 App 图标（Assets.xcassets → AppIcon）
- 修改 `project.yml` 中的 Bundle ID
- 标准发音目前用系统 TTS；想要更自然的真人音，可替换为录音文件或云端 TTS
