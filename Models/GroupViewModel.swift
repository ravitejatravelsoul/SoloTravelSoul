import Foundation
import FirebaseFirestore

@MainActor
class GroupViewModel: ObservableObject {
    @Published var groups: [GroupTrip] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private let db = Firestore.firestore()
    private var listener: ListenerRegistration?

    init() { fetchGroups() }

    deinit { listener?.remove() }

    func fetchGroups() {
        listener?.remove()
        listener = db.collection("groups").addSnapshotListener { [weak self] snapshot, error in
            guard let self else { return }
            if let error = error {
                Task { @MainActor in self.errorMessage = error.localizedDescription }
                return
            }
            guard let docs = snapshot?.documents else { return }
            let parsed = docs.compactMap { doc -> GroupTrip? in
                var data = doc.data()
                data["id"] = doc.documentID
                return GroupTrip.fromDict(data)
            }
            Task { @MainActor in self.groups = parsed }
        }
    }

    func createGroup(
        name: String,
        destination: String,
        startDate: Date,
        endDate: Date,
        description: String?,
        activities: [String],
        creator: UserProfile
    ) {
        let id = UUID().uuidString
        let group = GroupTrip(
            id: id,
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
        db.collection("groups").document(id).setData(group.toDict()) { [weak self] error in
            if let error = error {
                Task { @MainActor in self?.errorMessage = "Create failed: \(error.localizedDescription)" }
            }
        }
    }

    func group(by id: String?) -> GroupTrip? {
        guard let id else { return nil }
        return groups.first { $0.id == id }
    }

    func requestToJoin(group: GroupTrip, user: UserProfile) {
        guard let groupId = group.id else { return }
        if group.members.contains(where: { $0.id == user.id }) ||
            group.requests.contains(where: { $0.id == user.id }) ||
            group.joinRequests.contains(user.id) { return }

        db.collection("groups").document(groupId).updateData([
            "requests": FieldValue.arrayUnion([user.toDict()]),
            "joinRequests": FieldValue.arrayUnion([user.id])
        ])
    }

    func cancelJoinRequest(group: GroupTrip, userId: String) {
        guard let groupId = group.id else { return }
        var updates: [String: Any] = [
            "joinRequests": FieldValue.arrayRemove([userId])
        ]
        let reqDicts = group.requests.filter { $0.id == userId }.map { $0.toDict() }
        if !reqDicts.isEmpty {
            updates["requests"] = FieldValue.arrayRemove(reqDicts)
        }
        db.collection("groups").document(groupId).updateData(updates)
    }

    func approveRequest(group: GroupTrip, user: UserProfile) {
        guard let groupId = group.id else { return }
        db.collection("groups").document(groupId).updateData([
            "requests": FieldValue.arrayRemove([user.toDict()]),
            "joinRequests": FieldValue.arrayRemove([user.id]),
            "members": FieldValue.arrayUnion([user.toDict()])
        ])
    }

    func declineRequest(group: GroupTrip, user: UserProfile) {
        guard let groupId = group.id else { return }
        db.collection("groups").document(groupId).updateData([
            "requests": FieldValue.arrayRemove([user.toDict()]),
            "joinRequests": FieldValue.arrayRemove([user.id])
        ])
    }

    func approveAll(group: GroupTrip) {
        guard let groupId = group.id else { return }
        let newMembers = group.requests.map { $0.toDict() }
        let newIds = group.requests.map { $0.id }
        db.collection("groups").document(groupId).updateData([
            "members": FieldValue.arrayUnion(newMembers),
            "requests": [],
            "joinRequests": FieldValue.arrayRemove(newIds)
        ])
    }

    func leaveGroup(group: GroupTrip, userId: String) {
        guard let groupId = group.id else { return }
        if group.creator.id == userId {
            print("Creator cannot leave without ownership transfer.")
            return
        }
        let removal = group.members.filter { $0.id == userId }.map { $0.toDict() }
        db.collection("groups").document(groupId).updateData([
            "members": FieldValue.arrayRemove(removal)
        ])
    }

    func linkTrip(group: GroupTrip, tripId: String) {
        guard let groupId = group.id, !tripId.isEmpty else { return }
        if group.linkedTripIDs.contains(tripId) { return }
        db.collection("groups").document(groupId).updateData([
            "linkedTripIDs": FieldValue.arrayUnion([tripId])
        ])
    }

    func unlinkTrip(group: GroupTrip, tripId: String) {
        guard let groupId = group.id, !tripId.isEmpty else { return }
        db.collection("groups").document(groupId).updateData([
            "linkedTripIDs": FieldValue.arrayRemove([tripId])
        ])
    }
}
