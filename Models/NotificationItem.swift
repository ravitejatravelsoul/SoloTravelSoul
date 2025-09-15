import Foundation
import FirebaseFirestore

public struct NotificationItem: Identifiable, Codable, Hashable {
    public let id: String
    public let type: String      // "join_request", "join_approved", "join_denied", "group_chat"
    public let groupId: String?  // for linking to a group or chat
    public let title: String
    public let message: String
    public let createdAt: Date
    public let isRead: Bool

    public init(
        id: String = UUID().uuidString,
        type: String = "",
        groupId: String? = nil,
        title: String,
        message: String,
        createdAt: Date = Date(),
        isRead: Bool = false
    ) {
        self.id = id
        self.type = type
        self.groupId = groupId
        self.title = title
        self.message = message
        self.createdAt = createdAt
        self.isRead = isRead
    }

    public func toDict() -> [String: Any] {
        var dict: [String: Any] = [
            "id": id,
            "type": type,
            "title": title,
            "message": message,
            // Store createdAt as Firestore Timestamp for consistency
            "createdAt": Timestamp(date: createdAt),
            "isRead": isRead
        ]
        if let groupId = groupId { dict["groupId"] = groupId }
        return dict
    }

    public static func fromDict(_ dict: [String: Any]) -> NotificationItem? {
        // Try to get id from dict, fallback to documentID
        guard let id = dict["id"] as? String,
              let type = dict["type"] as? String,
              let title = dict["title"] as? String,
              let message = dict["message"] as? String
        else { return nil }

        let groupId = dict["groupId"] as? String

        var createdAt: Date = Date()
        if let ts = dict["createdAt"] as? Timestamp {
            createdAt = ts.dateValue()
        } else if let ts = dict["createdAt"] as? TimeInterval {
            createdAt = Date(timeIntervalSince1970: ts)
        } else if let date = dict["createdAt"] as? Date {
            createdAt = date
        }

        let isRead = dict["isRead"] as? Bool ?? false

        return NotificationItem(
            id: id, type: type, groupId: groupId,
            title: title, message: message,
            createdAt: createdAt, isRead: isRead
        )
    }
}
