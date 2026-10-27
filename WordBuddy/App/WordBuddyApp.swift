import SwiftUI
import SwiftData
import UserNotifications

@main
struct WordBuddyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(AppRouter.shared)
        }
        .modelContainer(for: [WordProgress.self, PracticeRecord.self])
    }
}

// MARK: - 路由（通知点击后跳转到对应 Tab）

enum AppTab: Hashable { case learn, review, story, speak }

final class AppRouter: ObservableObject {
    static let shared = AppRouter()
    @Published var tab: AppTab = .learn
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse) async {
        let target = response.notification.request.content.userInfo["tab"] as? String
        await MainActor.run {
            AppRouter.shared.tab = (target == "story") ? .story : .review
        }
    }
}

// MARK: - 根视图

struct RootView: View {
    @EnvironmentObject private var router: AppRouter
    @Environment(\.scenePhase) private var scenePhase
    @Query private var progress: [WordProgress]

    private var dueCount: Int { progress.filter { $0.nextReview <= .now }.count }

    var body: some View {
        TabView(selection: $router.tab) {
            LearnHomeView()
                .tabItem { Label("学习", systemImage: "book.fill") }
                .tag(AppTab.learn)
            ReviewHomeView()
                .tabItem { Label("复习", systemImage: "arrow.triangle.2.circlepath") }
                .tag(AppTab.review)
                .badge(dueCount)
            StoryHubView()
                .tabItem { Label("剧场", systemImage: "theatermasks.fill") }
                .tag(AppTab.story)
            SpeakHubView()
                .tabItem { Label("发音", systemImage: "waveform") }
                .tag(AppTab.speak)
        }
        .tint(.indigo)
        .task {
            // UI 自动化测试时跳过系统权限弹窗
            if !ProcessInfo.processInfo.arguments.contains("-uiTesting") {
                NotificationService.requestAuthorization()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { NotificationService.refresh(progress: progress) }
        }
    }
}
