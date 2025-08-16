import Foundation
import FirebaseFirestore

public class NotificationsViewModel: ObservableObject {
    @Published public var notifications: [NotificationItem] = []
    private let db = Firestore.firestore()
    private var userId: String = ""
    private var listener: ListenerRegistration?

    public func setup(userId: String) {
        self.userId = userId
        listener?.remove()
        listener = db.collection("users").document(userId).collection("notifications")
            .order(by: "createdAt", descending: true)
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self = self else { return }
                let docs = snapshot?.documents ?? []
                self.notifications = docs.compactMap { NotificationItem.fromDict($0.data()) }
            }
    }

    public func markAsRead(notificationId: String) {
        db.collection("users").document(userId).collection("notifications").document(notificationId)
            .updateData(["isRead": true])
    }

    public func sendNotification(to userId: String, title: String, message: String) {
        let item = NotificationItem(title: title, message: message)
        db.collection("users").document(userId).collection("notifications").addDocument(data: item.toDict())
    }
}
