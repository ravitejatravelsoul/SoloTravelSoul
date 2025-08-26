import Foundation
import FirebaseFirestore

class GroupChatViewModel: ObservableObject {
    @Published var messages: [GroupMessage] = []
    private var listener: ListenerRegistration?
    private let db = Firestore.firestore()

    func setup(groupId: String) {
        listener?.remove()
        messages.removeAll()
        listener = db.collection("groupChats")
            .document(groupId)
            .collection("messages")
            .order(by: "timestamp")
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self = self else { return }
                if let docs = snapshot?.documents {
                    self.messages = docs.compactMap { GroupMessage(dict: $0.data()) }
                }
            }
    }

    func sendMessage(sender: UserProfile, text: String, groupId: String) {
        let message = GroupMessage(groupId: groupId, senderId: sender.id, senderName: sender.name, text: text)

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

            // Send the message
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

            // Notify everyone except sender
            for memberId in memberIds where memberId != sender.id {
                NotificationsViewModel.sendNotification(
                    to: memberId,
                    type: "group_chat",
                    groupId: groupId,
                    title: "New message in \(groupName)",
                    message: "\(sender.name): \(text.prefix(100))"
                )
            }
        }
    }

    deinit {
        listener?.remove()
    }
}
