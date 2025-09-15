import Foundation
import FirebaseFirestore

class GroupChatViewModel: ObservableObject {
    @Published var messages: [GroupMessage] = []
    private var listener: ListenerRegistration?
    private let db = Firestore.firestore()
    private(set) var groupId: String = ""
    private(set) var userId: String = ""

    // Call this when opening the chat screen
    func setup(groupId: String, userId: String) {
        self.groupId = groupId
        self.userId = userId
        listener?.remove()
        messages.removeAll()
        listener = db.collection("groupChats")
            .document(groupId)
            .collection("messages")
            .order(by: "timestamp")
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self = self else { return }
                guard let docs = snapshot?.documents else { return }
                self.messages = docs.compactMap { GroupMessage(dict: $0.data()) }
                self.markAllMessagesAsRead()
            }
    }

    func sendMessage(sender: UserProfile, text: String, groupId: String) {
        let message = GroupMessage(
            groupId: groupId,
            senderId: sender.id,
            senderName: sender.name,
            text: text,
            isReadBy: [sender.id] // sender has read their own message
        )

        // Fetch group info from /groups in order to update /groupChats
        let groupRef = db.collection("groups").document(groupId)
        groupRef.getDocument { doc, error in
            var groupName = "Group"
            var memberIds: [String] = []
            if let data = doc?.data() {
                groupName = data["name"] as? String ?? "Group"
                if let members = data["members"] as? [[String: Any]] {
                    memberIds = members.compactMap { $0["id"] as? String }
                }
            }
            // Ensure parent groupChat document exists with needed fields
            let groupChatRef = self.db.collection("groupChats").document(groupId)
            groupChatRef.setData([
                "lastMessageAt": FieldValue.serverTimestamp(),
                "name": groupName,
                "members": memberIds
            ], merge: true)

            // Send the message with isReadBy field
            self.db.collection("groupChats")
                .document(groupId)
                .collection("messages")
                .document(message.id)
                .setData(message.dict) { error in
                    if let error = error {
                        print("❌ Error writing message: \(error.localizedDescription)")
                    } else {
                        print("✅ Message sent successfully")
                    }
                }

            // Notification for other users is now handled by Cloud Functions
        }
    }

    // MARK: - Mark all unread messages as read for this user
    func markAllMessagesAsRead() {
        let unreadMsgs = messages.filter { !($0.isReadBy?.contains(userId) ?? false) }
        for msg in unreadMsgs {
            db.collection("groupChats")
                .document(groupId)
                .collection("messages")
                .document(msg.id)
                .updateData([
                    "isReadBy": FieldValue.arrayUnion([userId])
                ])
        }
    }

    deinit {
        listener?.remove()
    }
}
