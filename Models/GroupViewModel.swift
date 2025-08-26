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
        removeGroupsListener()
    }

    // Remove the snapshot listener to avoid accessing deleted/left groups
    public func removeGroupsListener() {
        groupsListener?.remove()
        groupsListener = nil
        didFetchGroups = false
    }

    private func updateGroupChatDoc(for group: GroupTrip, completion: (() -> Void)? = nil) {
        let groupChatRef = db.collection("groupChats").document(group.id)
        let memberIds = group.members.map { $0.id }
        groupChatRef.setData([
            "name": group.name,
            "members": memberIds,
            "lastMessageAt": FieldValue.serverTimestamp()
        ], merge: true) { _ in completion?() }
    }

    public func fetchAllGroups() {
        if didFetchGroups {
            print("⚠️ fetchAllGroups called again; ignoring to prevent duplicate listeners.")
            return
        }
        didFetchGroups = true
        removeGroupsListener()
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
                self?.updateGroupChatDoc(for: group)
            }
        }
    }

    // MARK: - Group Membership & Requests Logic

    public func requestToJoin(group: GroupTrip, user: UserProfile) {
        let ref = db.collection(groupsCollection).document(group.id)
        ref.updateData([
            "joinRequests": FieldValue.arrayUnion([user.id]),
            "requests": FieldValue.arrayUnion([user.toDict()])
        ]) { [weak self] error in
            if let error = error {
                print("❌ Failed to send join request: \(error)")
            } else {
                self?.updateGroupChatDoc(for: group) {
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
    }

    public func cancelJoinRequest(group: GroupTrip, userId: String) {
        let ref = db.collection(groupsCollection).document(group.id)
        if let userProfile = group.requests.first(where: { $0.id == userId }) {
            ref.updateData([
                "joinRequests": FieldValue.arrayRemove([userId]),
                "requests": FieldValue.arrayRemove([userProfile.toDict()])
            ]) { [weak self] error in
                if let error = error {
                    print("❌ Failed to cancel join request: \(error)")
                }
                self?.updateGroupChatDoc(for: group)
            }
        } else {
            ref.updateData([
                "joinRequests": FieldValue.arrayRemove([userId])
            ]) { [weak self] error in
                if let error = error {
                    print("❌ Failed to cancel join request: \(error)")
                }
                self?.updateGroupChatDoc(for: group)
            }
        }
    }

    public func leaveGroup(group: GroupTrip, userId: String) {
        let ref = db.collection(groupsCollection).document(group.id)
        var updatedGroup = group
        if let userProfile = group.members.first(where: { $0.id == userId }) {
            ref.updateData([
                "members": FieldValue.arrayRemove([userProfile.toDict()])
            ]) { [weak self] error in
                if let error = error {
                    print("❌ Failed to leave group: \(error)")
                }
                updatedGroup.members.removeAll { $0.id == userId }
                self?.updateGroupChatDoc(for: updatedGroup)
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
        var updatedGroup = group
        updatedGroup.members.append(contentsOf: group.requests)
        ref.updateData([
            "requests": FieldValue.arrayRemove(requestUserDicts),
            "joinRequests": FieldValue.arrayRemove(requestUserIds),
            "members": FieldValue.arrayUnion(requestUserDicts)
        ]) { [weak self] error in
            if let error = error {
                print("❌ Failed to approve all requests: \(error)")
            }
            self?.updateGroupChatDoc(for: updatedGroup) {
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
        }
    }

    public func approveRequest(group: GroupTrip, user: UserProfile) {
        let ref = db.collection(groupsCollection).document(group.id)
        var updatedGroup = group
        updatedGroup.members.append(user)
        ref.updateData([
            "requests": FieldValue.arrayRemove([user.toDict()]),
            "joinRequests": FieldValue.arrayRemove([user.id]),
            "members": FieldValue.arrayUnion([user.toDict()])
        ]) { [weak self] error in
            if let error = error {
                print("❌ Failed to approve request: \(error)")
            } else {
                self?.updateGroupChatDoc(for: updatedGroup) {
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
    }

    public func declineRequest(group: GroupTrip, user: UserProfile) {
        let ref = db.collection(groupsCollection).document(group.id)
        ref.updateData([
            "requests": FieldValue.arrayRemove([user.toDict()]),
            "joinRequests": FieldValue.arrayRemove([user.id])
        ]) { [weak self] error in
            if let error = error {
                print("❌ Failed to decline request: \(error)")
            } else {
                self?.updateGroupChatDoc(for: group) {
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
    }

    // MARK: - Group Member Management (Promote/Demote/Remove Admin/Member)

    public func promoteMember(group: GroupTrip, member: UserProfile) {
        let groupRef = db.collection(groupsCollection).document(group.id)
        groupRef.updateData([
            "admins": FieldValue.arrayUnion([member.id])
        ]) { [weak self] error in
            if let error = error {
                print("❌ Failed to promote member: \(error)")
            } else {
                print("✅ \(member.name) promoted to admin")
                self?.updateGroupChatDoc(for: group) {
                    NotificationsViewModel.sendNotification(
                        to: member.id,
                        type: "promoted",
                        groupId: group.id,
                        title: "Promoted to Admin",
                        message: "You have been promoted to admin in '\(group.name)'."
                    )
                }
            }
        }
    }

    public func demoteMember(group: GroupTrip, member: UserProfile) {
        let groupRef = db.collection(groupsCollection).document(group.id)
        groupRef.updateData([
            "admins": FieldValue.arrayRemove([member.id])
        ]) { [weak self] error in
            if let error = error {
                print("❌ Failed to demote member: \(error)")
            } else {
                print("✅ \(member.name) demoted from admin")
                self?.updateGroupChatDoc(for: group) {
                    NotificationsViewModel.sendNotification(
                        to: member.id,
                        type: "demoted",
                        groupId: group.id,
                        title: "Demoted from Admin",
                        message: "You have been demoted from admin in '\(group.name)'."
                    )
                }
            }
        }
    }

    public func removeMember(group: GroupTrip, member: UserProfile) {
        let groupRef = db.collection(groupsCollection).document(group.id)
        var updatedGroup = group
        updatedGroup.members.removeAll { $0.id == member.id }
        groupRef.updateData([
            "members": FieldValue.arrayRemove([member.toDict()]),
            "admins": FieldValue.arrayRemove([member.id])
        ]) { [weak self] error in
            if let error = error {
                print("❌ Failed to remove member: \(error)")
            } else {
                print("✅ \(member.name) removed from group")
                self?.updateGroupChatDoc(for: updatedGroup) {
                    NotificationsViewModel.sendNotification(
                        to: member.id,
                        type: "removed",
                        groupId: group.id,
                        title: "Removed from Group",
                        message: "You have been removed from '\(group.name)'."
                    )
                }
            }
        }
    }

    // MARK: - Transfer Ownership then Leave (creator only)
    public func transferOwnershipAndLeave(group: GroupTrip, newCreator: UserProfile, previousCreatorId: String) {
        let groupRef = db.collection(groupsCollection).document(group.id)
        var updatedGroup = group
        updatedGroup.creator = newCreator
        updatedGroup.admins.append(newCreator.id)
        updatedGroup.members.removeAll { $0.id == previousCreatorId }
        updatedGroup.admins.removeAll { $0 == previousCreatorId }
        groupRef.updateData([
            "creator": newCreator.toDict(),
            "admins": FieldValue.arrayUnion([newCreator.id]),
            "members": FieldValue.arrayRemove([group.creator.toDict()]),
            "admins": FieldValue.arrayRemove([previousCreatorId])
        ]) { [weak self] error in
            if let error = error {
                print("❌ Failed to transfer ownership: \(error)")
            } else {
                print("✅ Ownership transferred to \(newCreator.name), previous creator removed")
                self?.updateGroupChatDoc(for: updatedGroup) {
                    NotificationsViewModel.sendNotification(
                        to: newCreator.id,
                        type: "ownership_transferred",
                        groupId: group.id,
                        title: "Ownership Transferred",
                        message: "You are now the owner of '\(group.name)'."
                    )
                    NotificationsViewModel.sendNotification(
                        to: previousCreatorId,
                        type: "left_group",
                        groupId: group.id,
                        title: "You Left the Group",
                        message: "You transferred ownership and left '\(group.name)'."
                    )
                }
            }
        }
    }

    public func deleteGroup(group: GroupTrip, completion: (() -> Void)? = nil) {
        let groupDoc = db.collection(groupsCollection).document(group.id)
        let groupChatDoc = db.collection("groupChats").document(group.id)
        let messagesCollection = groupChatDoc.collection("messages")

        messagesCollection.getDocuments { snapshot, error in
            if let docs = snapshot?.documents, !docs.isEmpty {
                let batch = self.db.batch()
                for doc in docs {
                    batch.deleteDocument(doc.reference)
                }
                batch.commit { batchError in
                    groupChatDoc.delete { _ in
                        groupDoc.delete { [weak self] error in
                            if let error = error {
                                DispatchQueue.main.async {
                                    self?.errorMessage = "Failed to delete group: \(error.localizedDescription)"
                                }
                                print("❌ Failed to delete group: \(error.localizedDescription)")
                            } else {
                                for member in group.members {
                                    NotificationsViewModel.sendNotification(
                                        to: member.id,
                                        type: "group_deleted",
                                        groupId: group.id,
                                        title: "Group Deleted",
                                        message: "The group '\(group.name)' has been deleted."
                                    )
                                }
                                print("✅ Group deleted: \(group.id)")
                                DispatchQueue.main.async {
                                    completion?()
                                }
                            }
                        }
                    }
                }
            } else {
                groupChatDoc.delete { _ in
                    groupDoc.delete { [weak self] error in
                        if let error = error {
                            DispatchQueue.main.async {
                                self?.errorMessage = "Failed to delete group: \(error.localizedDescription)"
                            }
                            print("❌ Failed to delete group: \(error.localizedDescription)")
                        } else {
                            for member in group.members {
                                NotificationsViewModel.sendNotification(
                                    to: member.id,
                                    type: "group_deleted",
                                    groupId: group.id,
                                    title: "Group Deleted",
                                    message: "The group '\(group.name)' has been deleted."
                                )
                            }
                            print("✅ Group deleted: \(group.id)")
                            DispatchQueue.main.async {
                                completion?()
                            }
                        }
                    }
                }
            }
        }
    }
}
