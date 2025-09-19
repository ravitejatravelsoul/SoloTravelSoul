import Foundation
import FirebaseFirestore

public class GroupViewModel: ObservableObject {
    @Published public var groups: [GroupTrip] = []
    @Published public var errorMessage: String?

    internal let db = Firestore.firestore()
    internal let groupsCollection = "groups"
    private var groupsListener: ListenerRegistration?
    private var joinRequestsListeners: [String: ListenerRegistration] = [:]

    public init() { }

    deinit {
        removeGroupsListener()
        removeAllJoinRequestsListeners()
    }

    public func removeGroupsListener() {
        groupsListener?.remove()
        groupsListener = nil
    }

    public func removeAllJoinRequestsListeners() {
        for (_, listener) in joinRequestsListeners {
            listener.remove()
        }
        joinRequestsListeners.removeAll()
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

    // Real-time fetch: listens to all groups, passes all to the UI for sectioning/filtering.
    public func fetchAllGroupsAndFilter(for user: UserProfile) {
        removeGroupsListener()
        groupsListener = db.collection(groupsCollection)
            .order(by: "startDate", descending: false)
            .addSnapshotListener { [weak self] snapshot, error in
                if let error = error {
                    DispatchQueue.main.async {
                        self?.errorMessage = "Failed to load groups: \(error.localizedDescription)"
                    }
                    print("❌ fetchAllGroupsAndFilter error: \(error)")
                    return
                }
                let docs = snapshot?.documents ?? []
                let allGroups = docs.compactMap { GroupTrip.fromDict($0.data()) }
                DispatchQueue.main.async {
                    self?.groups = allGroups
                    if allGroups.isEmpty {
                        self?.errorMessage = "No groups found. Try creating one!"
                    } else {
                        self?.errorMessage = nil
                    }
                }
            }
    }

    // Standard fetch (listener, optional fallback)
    public func fetchAllGroups() {
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
                DispatchQueue.main.async {
                    self?.groups = allGroups
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

    // --- Group CRUD and Membership Methods ---

    public func createGroup(
        name: String,
        destination: String,
        startDate: Date,
        endDate: Date,
        description: String?,
        activities: [String],
        languages: [String] = [],
        creator: UserProfile
    ) {
        let group = GroupTrip(
            name: name,
            destination: destination,
            startDate: startDate,
            endDate: endDate,
            description: description,
            activities: activities.isEmpty ? [] : activities,
            languages: languages.isEmpty ? [] : languages,
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

    // --- JOIN REQUESTS WITH SUBCOLLECTION (NEW) ---
    public func requestToJoin(group: GroupTrip, user: UserProfile, completion: (() -> Void)? = nil) {
        let groupChatRef = db.collection("groupChats").document(group.id)
        let requestDoc = groupChatRef.collection("requests").document(user.id)
        let requestData: [String: Any] = [
            "requestorId": user.id,
            "requestorName": user.name,
            "createdAt": FieldValue.serverTimestamp()
        ]
        requestDoc.setData(requestData) { [weak self] error in
            if let error = error {
                print("❌ Failed to send join request: \(error)")
                DispatchQueue.main.async {
                    self?.errorMessage = "Failed to send join request: \(error.localizedDescription)"
                }
                completion?()
                return
            }
            print("✅ Join request sent to groupChats/\(group.id)/requests/\(user.id)")
            // PATCH: also update group doc joinRequests and requests
            let groupRef = self?.db.collection(self?.groupsCollection ?? "groups").document(group.id)
            groupRef?.updateData([
                "joinRequests": FieldValue.arrayUnion([user.id]),
                "requests": FieldValue.arrayUnion([user.toDict()])
            ]) { err in
                if let err = err {
                    print("❌ Failed to update group joinRequests: \(err)")
                }
                self?.fetchGroup(groupId: group.id) { _ in
                    completion?()
                }
            }
        }
    }

    public func cancelJoinRequest(group: GroupTrip, userId: String, completion: (() -> Void)? = nil) {
        let groupChatRef = db.collection("groupChats").document(group.id)
        let requestDoc = groupChatRef.collection("requests").document(userId)
        requestDoc.delete { [weak self] error in
            if let error = error {
                print("❌ Failed to cancel join request: \(error)")
                DispatchQueue.main.async {
                    self?.errorMessage = "Failed to cancel join request: \(error.localizedDescription)"
                }
                completion?()
                return
            }
            print("✅ Join request cancelled from groupChats/\(group.id)/requests/\(userId)")
            let groupRef = self?.db.collection(self?.groupsCollection ?? "groups").document(group.id)
            // Remove from requests if present (find UserProfile in group.requests)
            let removedProfiles = group.requests.filter { $0.id == userId }.map { $0.toDict() }
            groupRef?.updateData([
                "joinRequests": FieldValue.arrayRemove([userId]),
                "requests": FieldValue.arrayRemove(removedProfiles)
            ]) { err in
                if let err = err {
                    print("❌ Failed to update group joinRequests: \(err)")
                }
                self?.fetchGroup(groupId: group.id) { _ in
                    completion?()
                }
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
                // Notification for other users is now handled by Cloud Functions
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
                    // Notification for other users is now handled by Cloud Functions
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
                    // Notification for other users is now handled by Cloud Functions
                }
            }
        }
    }

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
                    // Notification for other users is now handled by Cloud Functions
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
                    // Notification for other users is now handled by Cloud Functions
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
                    // Notification for other users is now handled by Cloud Functions
                }
            }
        }
    }

    public func transferOwnershipAndLeave(group: GroupTrip, newCreator: UserProfile, previousCreatorId: String) {
        let groupRef = db.collection(groupsCollection).document(group.id)
        var updatedGroup = group
        updatedGroup.creator = newCreator
        updatedGroup.admins.append(newCreator.id)
        updatedGroup.members.removeAll { $0.id == previousCreatorId }
        updatedGroup.admins.removeAll { $0 == previousCreatorId }

        groupRef.getDocument { [weak self] snapshot, error in
            guard
                let data = snapshot?.data(),
                let members = data["members"] as? [[String: Any]],
                let prevCreatorDict = members.first(where: { ($0["id"] as? String) == previousCreatorId })
            else {
                print("❌ Could not find previous creator in members for removal.")
                return
            }
            groupRef.updateData([
                "creator": newCreator.toDict(),
                "admins": FieldValue.arrayUnion([newCreator.id]),
                "members": FieldValue.arrayRemove([prevCreatorDict])
            ]) { error in
                if let error = error {
                    print("❌ Failed to transfer ownership: \(error)")
                } else {
                    groupRef.updateData([
                        "admins": FieldValue.arrayRemove([previousCreatorId])
                    ]) { error in
                        if let error = error {
                            print("❌ Failed to remove previous admin: \(error)")
                        } else {
                            print("✅ Ownership transferred to \(newCreator.name), previous creator removed")
                            self?.updateGroupChatDoc(for: updatedGroup) {
                                // Notification for other users is now handled by Cloud Functions
                            }
                        }
                    }
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
                                // Notification for other users is now handled by Cloud Functions
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
                            // Notification for other users is now handled by Cloud Functions
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

    // --- Optionally add this for real-time join requests subscription ---
    public func observeJoinRequests(
        for groupId: String,
        onUpdate: @escaping ([JoinRequest]) -> Void
    ) {
        // Remove old if present
        joinRequestsListeners[groupId]?.remove()
        let listener = db.collection("groupChats")
            .document(groupId)
            .collection("requests")
            .addSnapshotListener { snapshot, error in
                if let error = error {
                    print("❌ Error observing join requests: \(error)")
                    onUpdate([])
                    return
                }
                let requests = snapshot?.documents.compactMap { JoinRequest.fromDict($0.data()) } ?? []
                onUpdate(requests)
            }
        joinRequestsListeners[groupId] = listener
    }
}
