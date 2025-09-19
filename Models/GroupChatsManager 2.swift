import Foundation
import FirebaseFirestore

class GroupChatsManager: ObservableObject {
    @Published var unreadCount: Int = 0
    weak var appState: AppState?
    private var listeners: [ListenerRegistration] = []
    private let db = Firestore.firestore()
    private var userId: String = ""

    func setup(userId: String, groupIds: [String], appState: AppState?) {
        self.userId = userId
        self.appState = appState
        removeListeners()
        unreadCount = 0

        for groupId in groupIds {
            let listener = db.collection("groupChats")
                .document(groupId)
                .collection("messages")
                .order(by: "timestamp", descending: true)
                .limit(to: 50) // Adjust as needed for performance
                .addSnapshotListener { [weak self] snapshot, error in
                    guard let self = self else { return }
                    let unreadMsgs = snapshot?.documents.filter { doc in
                        let isReadBy = doc.data()["isReadBy"] as? [String] ?? []
                        return !isReadBy.contains(userId)
                    }.count ?? 0
                    DispatchQueue.main.async {
                        self.unreadCount += unreadMsgs
                        self.appState?.unreadChatCount = self.unreadCount
                    }
                }
            listeners.append(listener)
        }
    }

    func removeListeners() {
        for l in listeners { l.remove() }
        listeners.removeAll()
    }
}
