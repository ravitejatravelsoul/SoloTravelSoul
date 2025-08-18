import SwiftUI

struct GroupDetailView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @ObservedObject var groupViewModel: GroupViewModel
    @State private var group: GroupTrip

    @State private var showMembers = false
    @State private var showChat = false

    // For delete/transfer/make admin logic:
    @State private var showDeleteAlert = false
    @State private var showAdminPicker = false
    @State private var showTransferPicker = false
    @State private var selectedAdmin: UserProfile? = nil
    @State private var selectedMember: UserProfile? = nil
    @State private var deleteActionPending = false

    enum DangerAction {
        case deleteGroup, makeAdmin, transferOwnership
    }
    @State private var actionToPerform: DangerAction?

    init(groupViewModel: GroupViewModel, group: GroupTrip) {
        self.groupViewModel = groupViewModel
        _group = State(initialValue: group)
    }

    var isCreator: Bool {
        authViewModel.user?.uid == group.creator.id
    }
    var isMember: Bool {
        guard let uid = authViewModel.user?.uid else { return false }
        return group.members.contains(where: { $0.id == uid })
    }
    var hasRequested: Bool {
        guard let uid = authViewModel.user?.uid else { return false }
        let inRequests = group.requests.contains(where: { $0.id == uid })
        let inJoinRequests = group.joinRequests.contains(uid)
        return inRequests || inJoinRequests
    }

    // Eligible admins for transfer (cannot be self)
    var eligibleNewAdmins: [UserProfile] {
        group.members.filter {
            !group.admins.contains($0.id) && $0.id != group.creator.id
        }
    }
    var eligibleCurrentAdmins: [UserProfile] {
        group.members.filter {
            group.admins.contains($0.id) && $0.id != group.creator.id
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                groupHeaderSection
                activitiesSection
                Divider()
                Button {
                    showMembers = true
                } label: {
                    Label("View Members (\(group.members.count))", systemImage: "person.3.fill")
                }
                Button {
                    showChat = true
                } label: {
                    Label("Open Group Chat", systemImage: "bubble.left.and.bubble.right.fill")
                }
                Divider()
                if isCreator {
                    creatorRequestSection
                    Divider()
                    creatorDangerSection
                } else {
                    joinControlsSection
                }
            }
            .padding()
        }
        .navigationTitle("Group")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showMembers) {
            NavigationView {
                GroupMembersListView(groupViewModel: groupViewModel, group: $group)
            }
        }
        .sheet(isPresented: $showChat) {
            NavigationView {
                if let user = authViewModel.currentUserProfile {
                    GroupChatView(
                        chatVM: GroupChatViewModel(),
                        currentUser: user,
                        groupId: group.id
                    )
                } else {
                    Text("User not found")
                }
            }
        }
        .onAppear {
            reloadGroup()
        }
        .alert("Group Actions", isPresented: $showDeleteAlert, actions: {
            Button("Delete Group", role: .destructive) {
                groupViewModel.deleteGroup(group: group)
                // Optionally: navigate out of this view
            }
            if !eligibleNewAdmins.isEmpty {
                Button("Make Admin", role: .none) {
                    selectedMember = eligibleNewAdmins.first
                    showAdminPicker = true
                }
            }
            if !eligibleCurrentAdmins.isEmpty {
                Button("Transfer Ownership & Leave", role: .none) {
                    selectedAdmin = eligibleCurrentAdmins.first
                    showTransferPicker = true
                }
            }
            Button("Cancel", role: .cancel) { }
        }, message: {
            Text("You can delete the group, make someone else admin, or transfer ownership and leave the group.")
        })
        .sheet(isPresented: $showAdminPicker) {
            NavigationView {
                VStack {
                    Text("Make Admin")
                        .font(.title2)
                        .padding(.top)
                    Text("Select a member to promote to admin:")
                        .font(.body)
                        .multilineTextAlignment(.center)
                        .padding(.bottom)
                    Picker("Select Member", selection: $selectedMember) {
                        ForEach(eligibleNewAdmins, id: \.id) { member in
                            Text(member.name).tag(member as UserProfile?)
                        }
                    }
                    .pickerStyle(.wheel)
                    .frame(height: 120)
                    Button("Promote to Admin") {
                        if let member = selectedMember {
                            groupViewModel.promoteMember(group: group, member: member)
                            reloadGroup()
                            showAdminPicker = false
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.top)
                    .disabled(selectedMember == nil)
                    Spacer()
                }
                .padding()
                .navigationTitle("Make Admin")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showAdminPicker = false }
                    }
                }
            }
        }
        .sheet(isPresented: $showTransferPicker) {
            NavigationView {
                VStack {
                    Text("Transfer Group Ownership")
                        .font(.title2)
                        .padding(.top)
                    Text("Select an admin to transfer group ownership to before leaving:")
                        .font(.body)
                        .multilineTextAlignment(.center)
                        .padding(.bottom)
                    Picker("New Creator", selection: $selectedAdmin) {
                        ForEach(eligibleCurrentAdmins, id: \.id) { admin in
                            Text(admin.name).tag(admin as UserProfile?)
                        }
                    }
                    .pickerStyle(.wheel)
                    .frame(height: 120)
                    Button("Transfer & Leave Group") {
                        if let admin = selectedAdmin {
                            groupViewModel.transferOwnershipAndLeave(group: group, newCreator: admin, previousCreatorId: group.creator.id)
                            reloadGroup()
                            showTransferPicker = false
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.top)
                    .disabled(selectedAdmin == nil)
                    Spacer()
                }
                .padding()
                .navigationTitle("Transfer Ownership")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showTransferPicker = false }
                    }
                }
            }
        }
    }

    // MARK: - Sections

    private var groupHeaderSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(group.name)
                .font(.largeTitle)
                .bold()

            Text(group.destination)
                .font(.headline)
                .foregroundColor(.secondary)

            Text("\(group.startDate.formatted(date: .abbreviated, time: .omitted)) - \(group.endDate.formatted(date: .abbreviated, time: .omitted))")
                .font(.subheadline)

            if let desc = group.description, !desc.isEmpty {
                Text(desc)
                    .font(.body)
            }
        }
    }

    private var activitiesSection: some View {
        Group {
            if let activities = group.activities, !activities.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Activities")
                        .font(.headline)
                    ForEach(activities, id: \.self) { act in
                        HStack {
                            Image(systemName: "checkmark.circle")
                                .foregroundColor(.blue)
                            Text(act)
                        }
                        .font(.subheadline)
                    }
                }
            }
        }
    }

    private var creatorRequestSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Join Requests (\(pendingRequests.count))")
                    .font(.headline)
                Spacer()
                if !pendingRequests.isEmpty {
                    Button("Approve All") {
                        approveAll()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .font(.subheadline)
                }
            }
            if pendingRequests.isEmpty {
                Text("No pending requests.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                ForEach(pendingRequests, id: \.id) { requester in
                    HStack(spacing: 10) {
                        UserAvatarView(user: requester, size: 32)
                        Text(requester.name)
                            .font(.body)
                            .lineLimit(1)
                        Spacer()
                        Button {
                            approve(requester)
                        } label: {
                            Image(systemName: "checkmark.circle.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                        .frame(width: 36, height: 36)
                        .font(.title3)

                        Button {
                            deny(requester)
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                        .frame(width: 36, height: 36)
                        .font(.title3)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private var creatorDangerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()
            Button(role: .destructive) {
                showDeleteAlert = true
            } label: {
                Label("Delete Group", systemImage: "trash")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .padding(.top)
        }
    }

    private var pendingRequests: [UserProfile] {
        group.requests.filter { req in
            !group.members.contains(where: { $0.id == req.id })
        }
    }

    private var joinControlsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            if isMember {
                GroupBadge(title: "You are a member", systemImage: "checkmark.seal.fill", color: .green)
            } else if hasRequested {
                GroupBadge(title: "Join request pending", systemImage: "hourglass", color: .orange)
                Button("Cancel Request") {
                    if let uid = authViewModel.user?.uid {
                        groupViewModel.cancelJoinRequest(group: group, userId: uid)
                        reloadGroup()
                    }
                }
                .foregroundColor(.orange)
            } else {
                Button {
                    if let profile = authViewModel.profile {
                        groupViewModel.requestToJoin(group: group, user: profile)
                        reloadGroup()
                    } else if let fallback = authViewModel.currentUserProfile {
                        groupViewModel.requestToJoin(group: group, user: fallback)
                        reloadGroup()
                    }
                } label: {
                    Label("Request to Join", systemImage: "person.badge.plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    // MARK: - Approve/Deny logic with state/UI update

    private func approve(_ user: UserProfile) {
        groupViewModel.approveRequest(group: group, user: user)
        reloadGroup()
    }

    private func deny(_ user: UserProfile) {
        groupViewModel.declineRequest(group: group, user: user)
        reloadGroup()
    }

    private func approveAll() {
        groupViewModel.approveAll(group: group)
        reloadGroup()
    }

    private func reloadGroup() {
        groupViewModel.fetchGroup(groupId: group.id) { updatedGroup in
            if let updated = updatedGroup {
                self.group = updated
            }
        }
    }
}

struct GroupBadge: View {
    let title: String
    let systemImage: String
    let color: Color
    var body: some View {
        HStack {
            Image(systemName: systemImage)
            Text(title)
                .font(.caption)
        }
        .padding(6)
        .background(color.opacity(0.15))
        .foregroundColor(color)
        .clipShape(Capsule())
    }
}
