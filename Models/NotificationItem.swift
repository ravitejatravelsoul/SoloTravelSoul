//
//  NotificationItem.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 8/8/25.
//


import Foundation

struct NotificationItem: Identifiable, Codable {
    var id: String            // Firestore document ID
    var toUserId: String      // Recipient user ID (group creator)
    var fromUserId: String    // The user who requested
    var groupId: String
    var type: String          // e.g., "join_request"
    var timestamp: TimeInterval
    var message: String
}
