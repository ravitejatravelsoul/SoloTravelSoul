import SwiftUI

struct GroupMembersListView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @ObservedObject var groupViewModel: GroupViewModel
    @Binding var group: GroupTrip

    @State private var showRemoveAlert = false
    @State private var memberToRemove: UserProfile?

    var body: some View {
        List {
            ForEach(group.members) { user in
                HStack {
                    UserAvatarView(user: user, size: 36)
                    Text(user.name)
                    if user.id == group.creator.id {
                        Text("(Creator)").font(.caption).foregroundColor(.yellow)
                    } else if group.admins.contains(user.id) {
                        Text("(Admin)").font(.caption).foregroundColor(.blue)
                    }
                    Spacer()
                    // Only one action at a time: Promote, Demote, or Remove
                    if canPromote(user: user) {
                        Button("Promote") {
                            groupViewModel.promoteMember(group: group, member: user)
                            reloadGroup()
                        }
                        .foregroundColor(.blue)
                    } else if canDemote(user: user) {
                        Button("Demote") {
                            groupViewModel.demoteMember(group: group, member: user)
                            reloadGroup()
                        }
                        .foregroundColor(.orange)
                    } else if canRemove(user: user) {
                        Button(role: .destructive) {
                            memberToRemove = user
                            showRemoveAlert = true
                        } label: {
                            Image(systemName: "trash")
                        }
                    }
                }
            }
        }
        .alert(
            "Remove Member",
            isPresented: $showRemoveAlert,
            presenting: memberToRemove
        ) { member in
            Button("Remove", role: .destructive) {
                groupViewModel.removeMember(group: group, member: member)
                reloadGroup()
            }
            Button("Cancel", role: .cancel) { }
        } message: { member in
            Text("Are you sure you want to remove \(member.name) from the group?")
        }
        .navigationTitle("Group Members")
    }

    func canPromote(user: UserProfile) -> Bool {
        guard let currentUid = authViewModel.user?.uid else { return false }
        return group.creator.id == currentUid && user.id != group.creator.id && !group.admins.contains(user.id)
    }
    func canDemote(user: UserProfile) -> Bool {
        guard let currentUid = authViewModel.user?.uid else { return false }
        return group.creator.id == currentUid && user.id != group.creator.id && group.admins.contains(user.id)
    }
    func canRemove(user: UserProfile) -> Bool {
        guard let currentUid = authViewModel.user?.uid else { return false }
        let isSelf = user.id == currentUid
        let isCreator = user.id == group.creator.id
        let isAdmin = group.admins.contains(currentUid)
        let notPromoteOrDemote = !(canPromote(user: user) || canDemote(user: user))
        return (group.creator.id == currentUid || isAdmin) && !isSelf && !isCreator && notPromoteOrDemote
    }

    private func reloadGroup() {
        groupViewModel.fetchGroup(groupId: group.id) { updatedGroup in
            if let g = updatedGroup {
                group = g
            }
        }
    }
}
