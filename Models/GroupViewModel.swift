import Foundation
import FirebaseFirestore
import SwiftUI

class GroupViewModel: ObservableObject {
    @Published var groups: [GroupTrip] = []
    private var db = Firestore.firestore()
    private var listener: ListenerRegistration?

    init() {
        fetchGroups()
    }

    deinit {
        listener?.remove()
    }

    func fetchGroups() {
        listener = db.collection("groups").addSnapshotListener { [weak self] (snapshot, error) in
            guard let documents = snapshot?.documents else {
                print("No groups in Firestore")
                return
            }
            self?.groups = documents.compactMap { doc in
                var dict = doc.data()
                dict["id"] = doc.documentID // set id from Firestore documentID
                return GroupTrip.fromDict(dict)
            }
        }
    }

    func createGroup(name: String, destination: String, startDate: Date, endDate: Date, description: String?, activities: [String], creator: UserProfile) {
        let group = GroupTrip(
            id: UUID().uuidString,
            name: name,
            destination: destination,
            startDate: startDate,
            endDate: endDate,
            description: description,
            activities: activities,
            members: [creator],
            requests: [],
            creator: creator
        )
        let groupDict = group.toDict()
        db.collection("groups").document(group.id ?? UUID().uuidString).setData(groupDict) { error in
            if let error = error {
                print("Error saving group: \(error)")
            } else {
                print("Group saved successfully!")
            }
        }
    }

    func requestToJoin(group: GroupTrip, user: UserProfile) {
        guard let groupId = group.id, let idx = groups.firstIndex(where: { $0.id == group.id }) else { return }
        var updatedGroup = groups[idx]
        if !updatedGroup.members.contains(user) && !updatedGroup.requests.contains(user) {
            updatedGroup.requests.append(user)
            let groupDict = updatedGroup.toDict()
            db.collection("groups").document(groupId).setData(groupDict) { error in
                if let error = error {
                    print("Error updating requests: \(error)")
                } else {
                    // Add notification for the group creator
                    let notificationDict: [String: Any] = [
                        "toUserId": group.creator.id,
                        "fromUserId": user.id,
                        "groupId": groupId,
                        "type": "join_request",
                        "timestamp": Date().timeIntervalSince1970,
                        "message": "\(user.name) requested to join your group '\(group.name)'"
                    ]
                    self.db.collection("notifications").addDocument(data: notificationDict) { notifError in
                        if let notifError = notifError {
                            print("Error adding notification: \(notifError)")
                        } else {
                            print("Notification sent to group creator!")
                        }
                    }
                }
            }
        }
    }

    func approveRequest(group: GroupTrip, user: UserProfile) {
        guard let groupId = group.id, let idx = groups.firstIndex(where: { $0.id == group.id }) else { return }
        var updatedGroup = groups[idx]
        if let reqIdx = updatedGroup.requests.firstIndex(of: user) {
            updatedGroup.requests.remove(at: reqIdx)
            updatedGroup.members.append(user)
            let groupDict = updatedGroup.toDict()
            db.collection("groups").document(groupId).setData(groupDict) { error in
                if let error = error {
                    print("Error approving request: \(error)")
                }
            }
        }
    }
}
