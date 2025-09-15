import Foundation
import Combine

class AppState: ObservableObject {
    @Published var unreadNotificationCount: Int = 0
    @Published var unreadChatCount: Int = 0
    // Add more shared/global state as your app grows
}
