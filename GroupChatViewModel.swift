import Foundation
import FirebaseFirestore

public class GroupChatViewModel: ObservableObject {
    @Published public var messages: [Message] = []
    private let db = Firestore.firestore()
    private var listener: ListenerRegistration?
    private var groupId: String = ""

    public func setup(groupId: String) {
        self.groupId = groupId
        listener?.remove()
        listener = db.collection("groups").document(groupId).collection("messages")
            .order(by: "timestamp", descending: false)
            .addSnapshotListener { [weak self] snapshot, error in
                guard let self = self else { return }
                let docs = snapshot?.documents ?? []
                self.messages = docs.compactMap { Message.fromDict($0.data()) }
            }
    }

    public func sendMessage(sender: UserProfile, text: String) {
        let message = Message(senderId: sender.id, senderName: sender.name, text: text)
        db.collection("groups").document(groupId).collection("messages").addDocument(data: message.toDict())
    }
}
