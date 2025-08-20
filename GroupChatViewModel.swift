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
        db.collection("groupChats")
            .document(groupId)
            .collection("messages")
            .document(message.id)
            .setData(message.dict)

        // Fetch group members and notify everyone except sender
        let groupRef = db.collection("groups").document(groupId)
        groupRef.getDocument { doc, error in
            guard let data = doc?.data(),
                  let members = data["members"] as? [[String: Any]],
                  let groupName = data["name"] as? String
            else { return }
            for member in members {
                if let memberId = member["id"] as? String, memberId != sender.id {
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
    }

    deinit {
        listener?.remove()
    }
}
