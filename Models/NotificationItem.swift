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
            "createdAt": createdAt.timeIntervalSince1970,
            "isRead": isRead
        ]
        if let groupId = groupId { dict["groupId"] = groupId }
        return dict
    }

    public static func fromDict(_ dict: [String: Any]) -> NotificationItem? {
        guard let id = dict["id"] as? String,
              let type = dict["type"] as? String,
              let title = dict["title"] as? String,
              let message = dict["message"] as? String,
              let isRead = dict["isRead"] as? Bool else { return nil }
        let groupId = dict["groupId"] as? String

        // Robust createdAt
        var createdAt: Date = Date()
        if let ts = dict["createdAt"] as? TimeInterval {
            createdAt = Date(timeIntervalSince1970: ts)
        } else if let ts = dict["createdAt"] as? Timestamp {
            createdAt = ts.dateValue()
        }

        return NotificationItem(
            id: id, type: type, groupId: groupId,
            title: title, message: message,
            createdAt: createdAt, isRead: isRead
        )
    }
}
