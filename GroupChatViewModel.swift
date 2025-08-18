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
    }

    deinit {
        listener?.remove()
    }
}
