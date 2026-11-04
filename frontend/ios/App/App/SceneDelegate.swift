import UIKit
import Capacitor

// iOS 26+ requires UIScene lifecycle adoption: an app built against that SDK
// without a scene manifest traps on launch inside
// _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption.
//
// Capacitor 7 still generates the AppDelegate-only project, so the scene is
// wired up here by hand. Declaring the manifest against Main.storyboard alone
// is not enough -- the window comes up but the bridge never initialises, which
// shows as a black screen -- so the bridge view controller is created directly.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = AppBridgeViewController()
        self.window = window
        window.makeKeyAndVisible()
    }
}

/// The app's web view, with the iPhone behaviours a plain WKWebView lacks.
class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Swipe in from the left edge to go back a page, as in every iOS
        // app. The site is a single-page app, but its in-app navigation
        // goes through history.pushState, which WKWebView's back list
        // records, so the gesture steps back through screens.
        webView?.allowsBackForwardNavigationGestures = true
    }
}
