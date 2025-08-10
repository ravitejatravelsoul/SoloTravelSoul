//
//  NotificationsViewModel.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 8/8/25.
//


import Foundation
import FirebaseFirestore

class NotificationsViewModel: ObservableObject {
    @Published var notifications: [NotificationItem] = []
    private var db = Firestore.firestore()
    private var listener: ListenerRegistration?

    func listenForNotifications(for userId: String) {
        listener?.remove() // Remove previous listener
        listener = db.collection("notifications")
            .whereField("toUserId", isEqualTo: userId)
            .order(by: "timestamp", descending: true)
            .addSnapshotListener { [weak self] (snapshot, error) in
                guard let docs = snapshot?.documents else {
                    print("No notifications found or error: \(error?.localizedDescription ?? "")")
                    return
                }
                self?.notifications = docs.compactMap { doc -> NotificationItem? in
                    let data = doc.data()
                    guard let toUserId = data["toUserId"] as? String,
                          let fromUserId = data["fromUserId"] as? String,
                          let groupId = data["groupId"] as? String,
                          let type = data["type"] as? String,
                          let timestamp = data["timestamp"] as? TimeInterval,
                          let message = data["message"] as? String
                    else { return nil }
                    return NotificationItem(
                        id: doc.documentID,
                        toUserId: toUserId,
                        fromUserId: fromUserId,
                        groupId: groupId,
                        type: type,
                        timestamp: timestamp,
                        message: message
                    )
                }
            }
    }

    deinit {
        listener?.remove()
    }
}
