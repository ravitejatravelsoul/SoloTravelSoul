import Foundation
import FirebaseFirestore

public class GroupViewModel: ObservableObject {
    @Published public var groups: [GroupTrip] = []
    @Published public var errorMessage: String?

    private let db = Firestore.firestore()
    private let groupsCollection = "groups"

    public init() {
        fetchGroups()
    }

    public func fetchGroups() {
        db.collection(groupsCollection)
            .order(by: "startDate", descending: false)
            .addSnapshotListener { [weak self] snapshot, error in
                if let error = error {
                    self?.errorMessage = error.localizedDescription
                    print("❌ fetchGroups error: \(error)")
                    return
                }
                let docs = snapshot?.documents ?? []
                self?.groups = docs.compactMap { GroupTrip.fromDict($0.data()) }
            }
    }

    public func createGroup(
        name: String,
        destination: String,
        startDate: Date,
        endDate: Date,
        description: String?,
        activities: [String],
        creator: UserProfile
    ) {
        // Make sure creator has correct name/id
        let group = GroupTrip(
            name: name,
            destination: destination,
            startDate: startDate,
            endDate: endDate,
            description: description,
            activities: activities,
            creator: creator,
            members: [creator]
        )
        db.collection(groupsCollection).document(group.id).setData(group.toDict()) { [weak self] error in
            if let error = error {
                self?.errorMessage = error.localizedDescription
                print("❌ Failed to create group: \(error)")
            } else {
                print("✅ Group created: \(group.id)")
                self?.fetchGroups()
            }
        }
    }

    // MARK: - Group Membership & Requests Logic

    public func requestToJoin(group: GroupTrip, user: UserProfile) {
        let ref = db.collection(groupsCollection).document(group.id)
        ref.updateData([
            "joinRequests": FieldValue.arrayUnion([user.id]),
            "requests": FieldValue.arrayUnion([user.toDict()])
        ]) { error in
            if let error = error {
                print("❌ Failed to send join request: \(error)")
            }
        }
    }

    public func cancelJoinRequest(group: GroupTrip, userId: String) {
        let ref = db.collection(groupsCollection).document(group.id)
        if let userProfile = group.requests.first(where: { $0.id == userId }) {
            ref.updateData([
                "joinRequests": FieldValue.arrayRemove([userId]),
                "requests": FieldValue.arrayRemove([userProfile.toDict()])
            ]) { error in
                if let error = error {
                    print("❌ Failed to cancel join request: \(error)")
                }
            }
        } else {
            ref.updateData([
                "joinRequests": FieldValue.arrayRemove([userId])
            ]) { error in
                if let error = error {
                    print("❌ Failed to cancel join request: \(error)")
                }
            }
        }
    }

    public func leaveGroup(group: GroupTrip, userId: String) {
        let ref = db.collection(groupsCollection).document(group.id)
        if let userProfile = group.members.first(where: { $0.id == userId }) {
            ref.updateData([
                "members": FieldValue.arrayRemove([userProfile.toDict()])
            ]) { error in
                if let error = error {
                    print("❌ Failed to leave group: \(error)")
                }
            }
        }
    }

    public func approveAll(group: GroupTrip) {
        let ref = db.collection(groupsCollection).document(group.id)
        let requestUserDicts = group.requests.map { $0.toDict() }
        let requestUserIds = group.requests.map { $0.id }
        ref.updateData([
            "requests": FieldValue.arrayRemove(requestUserDicts),
            "joinRequests": FieldValue.arrayRemove(requestUserIds),
            "members": FieldValue.arrayUnion(requestUserDicts)
        ]) { error in
            if let error = error {
                print("❌ Failed to approve all requests: \(error)")
            }
        }
    }

    public func approveRequest(group: GroupTrip, user: UserProfile) {
        let ref = db.collection(groupsCollection).document(group.id)
        ref.updateData([
            "requests": FieldValue.arrayRemove([user.toDict()]),
            "joinRequests": FieldValue.arrayRemove([user.id]),
            "members": FieldValue.arrayUnion([user.toDict()])
        ]) { error in
            if let error = error {
                print("❌ Failed to approve request: \(error)")
            }
        }
    }

    public func declineRequest(group: GroupTrip, user: UserProfile) {
        let ref = db.collection(groupsCollection).document(group.id)
        // FIX: Do NOT add to members here!
        ref.updateData([
            "requests": FieldValue.arrayRemove([user.toDict()]),
            "joinRequests": FieldValue.arrayRemove([user.id])
        ]) { error in
            if let error = error {
                print("❌ Failed to decline request: \(error)")
            }
        }
    }
}
