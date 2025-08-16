//
//  NotificationItem 2.swift
//  SoloTravelSoul
//
//  Created by Raviteja on 8/15/25.
//


import Foundation

public struct NotificationItem: Identifiable, Codable, Hashable {
    public let id: String
    public let title: String
    public let message: String
    public let createdAt: Date
    public let isRead: Bool

    public init(id: String = UUID().uuidString, title: String, message: String, createdAt: Date = Date(), isRead: Bool = false) {
        self.id = id
        self.title = title
        self.message = message
        self.createdAt = createdAt
        self.isRead = isRead
    }

    public func toDict() -> [String: Any] {
        [
            "id": id,
            "title": title,
            "message": message,
            "createdAt": createdAt.timeIntervalSince1970,
            "isRead": isRead
        ]
    }

    public static func fromDict(_ dict: [String: Any]) -> NotificationItem? {
        guard let id = dict["id"] as? String,
              let title = dict["title"] as? String,
              let message = dict["message"] as? String,
              let ts = dict["createdAt"] as? TimeInterval,
              let isRead = dict["isRead"] as? Bool else { return nil }
        return NotificationItem(id: id, title: title, message: message, createdAt: Date(timeIntervalSince1970: ts), isRead: isRead)
    }
}