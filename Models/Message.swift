//
//  Message.swift
//  SoloTravelSoul
//
//  Created by Raviteja on 8/15/25.
//


import Foundation

public struct Message: Identifiable, Codable, Hashable {
    public let id: String
    public let senderId: String
    public let senderName: String
    public let text: String
    public let timestamp: Date

    public init(id: String = UUID().uuidString, senderId: String, senderName: String, text: String, timestamp: Date = Date()) {
        self.id = id
        self.senderId = senderId
        self.senderName = senderName
        self.text = text
        self.timestamp = timestamp
    }

    public func toDict() -> [String: Any] {
        [
            "id": id,
            "senderId": senderId,
            "senderName": senderName,
            "text": text,
            "timestamp": timestamp.timeIntervalSince1970
        ]
    }

    public static func fromDict(_ dict: [String: Any]) -> Message? {
        guard let id = dict["id"] as? String,
              let senderId = dict["senderId"] as? String,
              let senderName = dict["senderName"] as? String,
              let text = dict["text"] as? String,
              let ts = dict["timestamp"] as? TimeInterval else { return nil }
        return Message(id: id, senderId: senderId, senderName: senderName, text: text, timestamp: Date(timeIntervalSince1970: ts))
    }
}