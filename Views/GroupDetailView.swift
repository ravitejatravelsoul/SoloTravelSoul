import SwiftUI

struct GroupDetailView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @ObservedObject var groupViewModel: GroupViewModel
    @State private var group: GroupTrip

    @Environment(\.presentationMode) var presentationMode

    @State private var showMembers = false
    @State private var showChat = false

    // For delete/transfer/make admin logic:
    @State private var showDeleteActionSheet = false
    @State private var showAdminPicker = false
    @State private var showTransferPicker = false
    @State private var selectedAdminId: String? = nil
    @State private var selectedTransferUserId: String? = nil
    @State private var showDeleteFinalAlert = false
    @State private var isPerformingAction = false

    init(groupViewModel: GroupViewModel, group: GroupTrip) {
        self.groupViewModel = groupViewModel
        _group = State(initialValue: group)
    }

    var isCreator: Bool {
        let myUid = authViewModel.user?.uid ?? "nil"
        let creatorId = group.creator.id
        print("DEBUG: My UID: \(myUid) | Group Creator ID: \(creatorId)")
        return myUid == creatorId
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

    var eligibleNewAdmins: [UserProfile] {
        group.members.filter { !group.admins.contains($0.id) && $0.id != group.creator.id }
    }
    var eligibleCurrentAdmins: [UserProfile] {
        group.members.filter { group.admins.contains($0.id) && $0.id != group.creator.id }
    }
    var eligibleMembersForTransfer: [UserProfile] {
        group.members.filter { $0.id != group.creator.id }
    }
    var isLastMember: Bool {
        group.members.count == 1 && group.creator.id == group.members.first?.id
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
            .disabled(isPerformingAction)
            .overlay(
                Group {
                    if isPerformingAction {
                        ZStack {
                            Color.black.opacity(0.2).ignoresSafeArea()
                            ProgressView("Processing...")
                                .progressViewStyle(CircularProgressViewStyle())
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                    }
                }
            )
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
        .onAppear { reloadGroup() }
        .actionSheet(isPresented: $showDeleteActionSheet) {
            var buttons: [ActionSheet.Button] = []
            if isLastMember {
                buttons.append(.destructive(Text("Delete Group for Everyone")) {
                    showDeleteFinalAlert = true
                })
            } else {
                if !eligibleMembersForTransfer.isEmpty {
                    buttons.append(.default(Text("Transfer Ownership & Leave")) {
                        showTransferPicker = true
                    })
                    if !eligibleNewAdmins.isEmpty {
                        buttons.append(.default(Text("Promote to Admin & Leave")) {
                            showAdminPicker = true
                        })
                    }
                }
            }
            buttons.append(.cancel())
            return ActionSheet(
                title: Text("Delete/Leave Group"),
                message: Text("Select an option for leaving or deleting the group."),
                buttons: buttons
            )
        }
        .alert("Delete Group?", isPresented: $showDeleteFinalAlert, actions: {
            Button("Delete Group", role: .destructive) {
                isPerformingAction = true
                groupViewModel.deleteGroup(group: group) {
                    groupViewModel.removeGroupsListener()
                    isPerformingAction = false
                    presentationMode.wrappedValue.dismiss()
                }
            }
            Button("Cancel", role: .cancel) { }
        }, message: {
            Text("Are you sure you want to delete this group? This cannot be undone.")
        })

        .sheet(isPresented: $showAdminPicker, onDismiss: {
            selectedAdminId = nil
        }) {
            NavigationView {
                VStack {
                    Text("Promote to Admin & Leave")
                        .font(.title2)
                        .padding(.top)
                    Text("Select a member to promote to admin before you leave:")
                        .font(.body)
                        .multilineTextAlignment(.center)
                        .padding(.bottom)
                    Picker("Select Member", selection: $selectedAdminId) {
                        ForEach(eligibleNewAdmins, id: \.id) { member in
                            Text(member.name).tag(member.id as String?)
                        }
                    }
                    .pickerStyle(.wheel)
                    .frame(height: 120)
                    .onAppear {
                        if selectedAdminId == nil, let first = eligibleNewAdmins.first {
                            selectedAdminId = first.id
                        }
                    }
                    Button("Promote & Leave Group") {
                        isPerformingAction = true
                        if let memberId = selectedAdminId,
                           let member = eligibleNewAdmins.first(where: { $0.id == memberId }) {
                            groupViewModel.promoteMember(group: group, member: member)
                            groupViewModel.leaveGroup(group: group, userId: group.creator.id)
                            groupViewModel.removeGroupsListener()
                            isPerformingAction = false
                            presentationMode.wrappedValue.dismiss()
                            showAdminPicker = false
                            selectedAdminId = nil
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.top)
                    .disabled(selectedAdminId == nil || isPerformingAction)
                    Spacer()
                }
                .padding()
                .navigationTitle("Promote & Leave")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            showAdminPicker = false
                            isPerformingAction = false
                            selectedAdminId = nil
                        }
                    }
                }
            }
        }

        .sheet(isPresented: $showTransferPicker, onDismiss: {
            selectedTransferUserId = nil
        }) {
            NavigationView {
                VStack {
                    Text("Transfer Group Ownership")
                        .font(.title2)
                        .padding(.top)
                    Text("Select a member to transfer group ownership to before leaving:")
                        .font(.body)
                        .multilineTextAlignment(.center)
                        .padding(.bottom)
                    Picker("New Owner", selection: $selectedTransferUserId) {
                        ForEach(eligibleMembersForTransfer, id: \.id) { member in
                            Text(member.name).tag(member.id as String?)
                        }
                    }
                    .pickerStyle(.wheel)
                    .frame(height: 120)
                    .onAppear {
                        if selectedTransferUserId == nil, let first = eligibleMembersForTransfer.first {
                            selectedTransferUserId = first.id
                        }
                    }
                    Button("Transfer & Leave Group") {
                        isPerformingAction = true
                        if let newOwnerId = selectedTransferUserId,
                           let newOwner = eligibleMembersForTransfer.first(where: { $0.id == newOwnerId }) {
                            groupViewModel.transferOwnershipAndLeave(
                                group: group,
                                newCreator: newOwner,
                                previousCreatorId: group.creator.id
                            )
                            groupViewModel.removeGroupsListener()
                            isPerformingAction = false
                            presentationMode.wrappedValue.dismiss()
                            showTransferPicker = false
                            selectedTransferUserId = nil
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.top)
                    .disabled(selectedTransferUserId == nil || isPerformingAction)
                    Spacer()
                }
                .padding()
                .navigationTitle("Transfer Ownership")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            showTransferPicker = false
                            isPerformingAction = false
                            selectedTransferUserId = nil
                        }
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
                showDeleteActionSheet = true
            } label: {
                Label("Delete/Leave Group", systemImage: "trash")
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
            } else {
                // If group is deleted or you have left, dismiss the view
                presentationMode.wrappedValue.dismiss()
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
