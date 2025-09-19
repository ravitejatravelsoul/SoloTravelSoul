import Foundation
import FirebaseFirestore
import FirebaseAuth

class NotificationsViewModel: ObservableObject {
    @Published var notifications: [NotificationItem] = []
    private let db = Firestore.firestore()
    private var userId: String = ""
    private var listener: ListenerRegistration?

    /// Sets up a real-time listener for notifications for the given user.
    func setup(userId: String) {
        self.userId = userId
        listener?.remove()
        listener = db.collection("users").document(userId).collection("notifications")
            .order(by: "createdAt", descending: true)
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self = self else { return }
                if let error = error {
                    print("Error fetching notifications: \(error.localizedDescription)")
                    return
                }
                let docs = snapshot?.documents ?? []
                let notifications = docs.compactMap { doc -> NotificationItem? in
                    var dict = doc.data()
                    // Always ensure id is set from Firestore documentID if not in data
                    dict["id"] = dict["id"] as? String ?? doc.documentID
                    return NotificationItem.fromDict(dict)
                }
                DispatchQueue.main.async {
                    self.notifications = notifications
                }
            }
    }

    /// Marks a notification as read in Firestore.
    func markAsRead(notificationId: String) {
        guard !notificationId.isEmpty, !userId.isEmpty else { return }
        db.collection("users").document(userId).collection("notifications").document(notificationId)
            .updateData(["isRead": true]) { error in
                if let error = error {
                    print("Failed to mark notification as read: \(error.localizedDescription)")
                }
            }
    }

    /// Sends a new notification ONLY to the current signed-in user.
    /// Do NOT use this to notify other users — handled by Cloud Functions/server.
    static func sendNotification(
        to userId: String,
        type: String,
        groupId: String? = nil,
        title: String,
        message: String
    ) {
        // Only allow if userId matches current user
        guard let currentUserId = Auth.auth().currentUser?.uid, currentUserId == userId else {
            print("⚠️ Refusing to send notification: can only send to signed-in user.")
            return
        }
        let item = NotificationItem(type: type, groupId: groupId, title: title, message: message)
        let db = Firestore.firestore()
        db.collection("users").document(userId).collection("notifications").addDocument(data: item.toDict()) { error in
            if let error = error {
                print("Failed to send notification: \(error.localizedDescription)")
            }
        }
    }

    deinit {
        listener?.remove()
    }
}
