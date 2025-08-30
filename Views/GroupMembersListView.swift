import SwiftUI

struct GroupMembersListView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @ObservedObject var groupViewModel: GroupViewModel
    @Binding var group: GroupTrip

    @State private var showRemoveAlert = false
    @State private var memberToRemove: UserProfile?

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(group.members) { user in
                    HStack(spacing: 16) {
                        UserAvatarView(user: user, size: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(user.name)
                                .font(.body.bold())
                                .foregroundColor(AppTheme.textPrimary)
                            if user.id == group.creator.id {
                                Text("(Creator)").font(.caption2).foregroundColor(AppTheme.accent)
                            } else if group.admins.contains(user.id) {
                                Text("(Admin)").font(.caption2).foregroundColor(AppTheme.primary)
                            }
                        }
                        Spacer()
                        if canPromote(user: user) {
                            Button("Promote") {
                                groupViewModel.promoteMember(group: group, member: user)
                                reloadGroup()
                            }
                            .font(.caption2)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(AppTheme.primary.opacity(0.1))
                            .foregroundColor(AppTheme.primary)
                            .cornerRadius(14)
                        } else if canDemote(user: user) {
                            Button("Demote") {
                                groupViewModel.demoteMember(group: group, member: user)
                                reloadGroup()
                            }
                            .font(.caption2)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(AppTheme.accent.opacity(0.1))
                            .foregroundColor(AppTheme.accent)
                            .cornerRadius(14)
                        } else if canRemove(user: user) {
                            Button(role: .destructive) {
                                memberToRemove = user
                                showRemoveAlert = true
                            } label: {
                                Image(systemName: "trash")
                                    .foregroundColor(.red)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.red.opacity(0.08))
                            .cornerRadius(14)
                        }
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal)
                    .background(AppTheme.card)
                    .cornerRadius(AppTheme.cardCornerRadius)
                    .shadow(color: AppTheme.shadow, radius: 2, x: 0, y: 1)
                    .padding(.vertical, 4)
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
        .background(AppTheme.background.ignoresSafeArea())
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
