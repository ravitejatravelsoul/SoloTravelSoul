import Foundation
import FirebaseFirestore

public class NotificationsViewModel: ObservableObject {
    @Published public var notifications: [NotificationItem] = []
    private let db = Firestore.firestore()
    private var userId: String = ""
    private var listener: ListenerRegistration?

    public func setup(userId: String) {
        print("SETTING UP NOTIFICATIONS LISTENER FOR USER: \(userId)")
        self.userId = userId
        listener?.remove()
        listener = db.collection("users").document(userId).collection("notifications")
            .order(by: "createdAt", descending: true)
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self = self else { return }
                let docs = snapshot?.documents ?? []
                print("Fetched \(docs.count) notifications from Firestore for user \(userId)")
                let notifications = docs.compactMap { doc -> NotificationItem? in
                    let dict = doc.data()
                    let notif = NotificationItem.fromDict(dict)
                    if notif == nil {
                        print("Failed to decode notification: \(dict)")
                    } else {
                        print("Decoded notification: \(notif!)")
                    }
                    return notif
                }
                print("Decoded \(notifications.count) notifications")
                self.notifications = notifications
            }
    }

    public func markAsRead(notificationId: String) {
        db.collection("users").document(userId).collection("notifications").document(notificationId)
            .updateData(["isRead": true])
    }

    // Use this static helper to send notifications from anywhere
    public static func sendNotification(
        to userId: String,
        type: String,
        groupId: String? = nil,
        title: String,
        message: String
    ) {
        let item = NotificationItem(type: type, groupId: groupId, title: title, message: message)
        let db = Firestore.firestore()
        db.collection("users").document(userId).collection("notifications").addDocument(data: item.toDict())
    }
}
