import Foundation
import FirebaseFirestore

public class GroupViewModel: ObservableObject {
    @Published public var groups: [GroupTrip] = []
    @Published public var errorMessage: String?

    private let db = Firestore.firestore()
    private let groupsCollection = "groups"
    private var groupsListener: ListenerRegistration?
    private var didFetchGroups = false

    public init() { }

    deinit {
        groupsListener?.remove()
    }

    /// Call this ONCE (in your main/root view's .onAppear, not repeatedly!)
    public func fetchAllGroups() {
        if didFetchGroups {
            print("⚠️ fetchAllGroups called again; ignoring to prevent duplicate listeners.")
            return
        }
        didFetchGroups = true
        groupsListener?.remove()
        groupsListener = db.collection(groupsCollection)
            .order(by: "startDate", descending: false)
            .addSnapshotListener { [weak self] snapshot, error in
                if let error = error {
                    DispatchQueue.main.async {
                        self?.errorMessage = error.localizedDescription
                    }
                    print("❌ fetchGroups error: \(error)")
                    return
                }
                let docs = snapshot?.documents ?? []
                let allGroups = docs.compactMap { GroupTrip.fromDict($0.data()) }
                if allGroups != self?.groups {
                    DispatchQueue.main.async {
                        self?.groups = allGroups
                    }
                }
            }
    }

    public func removeGroupsListener() {
        groupsListener?.remove()
        groupsListener = nil
        didFetchGroups = false
    }

    public func fetchAllGroupsOnce(completion: @escaping ([GroupTrip]) -> Void) {
        db.collection(groupsCollection)
            .order(by: "startDate", descending: false)
            .getDocuments { snapshot, error in
                if let error = error {
                    print("❌ fetchGroupsOnce error: \(error)")
                    completion([])
                    return
                }
                let docs = snapshot?.documents ?? []
                let allGroups = docs.compactMap { GroupTrip.fromDict($0.data()) }
                completion(allGroups)
            }
    }

    public func fetchGroup(groupId: String, completion: @escaping (GroupTrip?) -> Void) {
        db.collection(groupsCollection).document(groupId).getDocument { snapshot, error in
            if let error = error {
                print("❌ fetchGroup error: \(error)")
                completion(nil)
                return
            }
            if let data = snapshot?.data(), let group = GroupTrip.fromDict(data) {
                completion(group)
            } else {
                completion(nil)
            }
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
                DispatchQueue.main.async {
                    self?.errorMessage = error.localizedDescription
                }
                print("❌ Failed to create group: \(error)")
            } else {
                print("✅ Group created: \(group.id)")
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
            } else {
                // Notify group admins (or creator if no admins)
                let adminIds = group.admins.isEmpty ? [group.creator.id] : group.admins
                for adminId in adminIds {
                    NotificationsViewModel.sendNotification(
                        to: adminId,
                        type: "join_request",
                        groupId: group.id,
                        title: "New Join Request",
                        message: "\(user.name) requested to join '\(group.name)'"
                    )
                }
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
        ref.updateData([
            "admins": FieldValue.arrayRemove([userId])
        ])
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
        // Optionally send notifications for each user approved here
        for user in group.requests {
            NotificationsViewModel.sendNotification(
                to: user.id,
                type: "join_approved",
                groupId: group.id,
                title: "Request Approved",
                message: "You are now a member of '\(group.name)'!"
            )
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
            } else {
                NotificationsViewModel.sendNotification(
                    to: user.id,
                    type: "join_approved",
                    groupId: group.id,
                    title: "Request Approved",
                    message: "You are now a member of '\(group.name)'!"
                )
            }
        }
    }

    public func declineRequest(group: GroupTrip, user: UserProfile) {
        let ref = db.collection(groupsCollection).document(group.id)
        ref.updateData([
            "requests": FieldValue.arrayRemove([user.toDict()]),
            "joinRequests": FieldValue.arrayRemove([user.id])
        ]) { error in
            if let error = error {
                print("❌ Failed to decline request: \(error)")
            } else {
                NotificationsViewModel.sendNotification(
                    to: user.id,
                    type: "join_denied",
                    groupId: group.id,
                    title: "Request Denied",
                    message: "Your join request for '\(group.name)' was denied."
                )
            }
        }
    }

    // MARK: - Group Member Management (Promote/Demote/Remove Admin/Member)

    public func promoteMember(group: GroupTrip, member: UserProfile) {
        let groupRef = db.collection(groupsCollection).document(group.id)
        groupRef.updateData([
            "admins": FieldValue.arrayUnion([member.id])
        ]) { error in
            if let error = error {
                print("❌ Failed to promote member: \(error)")
            } else {
                print("✅ \(member.name) promoted to admin")
            }
        }
    }

    public func demoteMember(group: GroupTrip, member: UserProfile) {
        let groupRef = db.collection(groupsCollection).document(group.id)
        groupRef.updateData([
            "admins": FieldValue.arrayRemove([member.id])
        ]) { error in
            if let error = error {
                print("❌ Failed to demote member: \(error)")
            } else {
                print("✅ \(member.name) demoted from admin")
            }
        }
    }

    public func removeMember(group: GroupTrip, member: UserProfile) {
        let groupRef = db.collection(groupsCollection).document(group.id)
        groupRef.updateData([
            "members": FieldValue.arrayRemove([member.toDict()]),
            "admins": FieldValue.arrayRemove([member.id])
        ]) { error in
            if let error = error {
                print("❌ Failed to remove member: \(error)")
            } else {
                print("✅ \(member.name) removed from group")
            }
        }
    }

    // MARK: - Transfer Ownership then Leave (creator only)
    public func transferOwnershipAndLeave(group: GroupTrip, newCreator: UserProfile, previousCreatorId: String) {
        let groupRef = db.collection(groupsCollection).document(group.id)
        groupRef.updateData([
            "creator": newCreator.toDict(),
            "admins": FieldValue.arrayUnion([newCreator.id]),
            "members": FieldValue.arrayRemove([group.creator.toDict()]),
            "admins": FieldValue.arrayRemove([previousCreatorId])
        ]) { error in
            if let error = error {
                print("❌ Failed to transfer ownership: \(error)")
            } else {
                print("✅ Ownership transferred to \(newCreator.name), previous creator removed")
            }
        }
    }

    // MARK: - Delete Group (only for creator)
    public func deleteGroup(group: GroupTrip) {
        db.collection(groupsCollection).document(group.id).delete { [weak self] error in
            if let error = error {
                DispatchQueue.main.async {
                    self?.errorMessage = "Failed to delete group: \(error.localizedDescription)"
                }
                print("❌ Failed to delete group: \(error.localizedDescription)")
            } else {
                print("✅ Group deleted: \(group.id)")
            }
        }
    }
}
