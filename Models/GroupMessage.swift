import Foundation
import FirebaseFirestore

struct GroupMessage: Identifiable, Codable {
    let id: String
    let groupId: String
    let senderId: String
    let senderName: String
    let text: String
    let timestamp: Date

    init(id: String = UUID().uuidString, groupId: String, senderId: String, senderName: String, text: String, timestamp: Date = Date()) {
        self.id = id
        self.groupId = groupId
        self.senderId = senderId
        self.senderName = senderName
        self.text = text
        self.timestamp = timestamp
    }

    // Firestore compatibility
    init?(dict: [String: Any]) {
        guard let id = dict["id"] as? String,
              let groupId = dict["groupId"] as? String,
              let senderId = dict["senderId"] as? String,
              let senderName = dict["senderName"] as? String,
              let text = dict["text"] as? String
        else {
            return nil
        }
        // Handle Firestore Timestamp or TimeInterval
        var date: Date?
        if let timestamp = dict["timestamp"] as? Timestamp {
            date = timestamp.dateValue()
        } else if let timeInterval = dict["timestamp"] as? TimeInterval {
            date = Date(timeIntervalSince1970: timeInterval)
        }
        guard let safeDate = date else { return nil }
        self.id = id
        self.groupId = groupId
        self.senderId = senderId
        self.senderName = senderName
        self.text = text
        self.timestamp = safeDate
    }

    var dict: [String: Any] {
        [
            "id": id,
            "groupId": groupId,
            "senderId": senderId,
            "senderName": senderName,
            "text": text,
            "timestamp": Timestamp(date: timestamp)
        ]
    }
}
