import SwiftUI

struct GroupDetailView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @ObservedObject var groupViewModel: GroupViewModel
    let group: GroupTrip

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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                groupHeaderSection
                activitiesSection
                Divider()
                membersSection
                if isCreator {
                    creatorRequestSection
                } else {
                    joinControlsSection
                }
            }
            .padding()
        }
        .navigationTitle("Group")
        .navigationBarTitleDisplayMode(.inline)
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

    private var membersSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Members (\(group.members.count))")
                .font(.headline)
            ForEach(group.members, id: \.id) { member in
                HStack {
                    let isOwner = member.id == group.creator.id
                    let iconName = isOwner ? "crown.fill" : "person.circle"
                    let iconColor: Color = isOwner ? .yellow : .blue
                    Image(systemName: iconName)
                        .foregroundColor(iconColor)
                    Text(member.name)
                    if isOwner {
                        Text("(Creator)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            if isMember && !isCreator {
                Button(role: .destructive) {
                    if let uid = authViewModel.user?.uid {
                        groupViewModel.leaveGroup(group: group, userId: uid)
                    }
                } label: {
                    Label("Leave Group", systemImage: "rectangle.portrait.and.arrow.right")
                }
                .padding(.top, 4)
            }
        }
    }

    private var creatorRequestSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Join Requests (\(group.requests.count))")
                    .font(.headline)
                Spacer()
                if !group.requests.isEmpty {
                    Button("Approve All") {
                        groupViewModel.approveAll(group: group)
                    }
                }
            }
            if group.requests.isEmpty {
                Text("No pending requests.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                ForEach(group.requests, id: \.id) { requester in
                    HStack {
                        Text(requester.name)
                        Spacer()
                        Button {
                            groupViewModel.approveRequest(group: group, user: requester)
                        } label: {
                            Image(systemName: "checkmark.circle")
                                .foregroundColor(.green)
                        }
                        Button {
                            groupViewModel.declineRequest(group: group, user: requester)
                        } label: {
                            Image(systemName: "xmark.circle")
                                .foregroundColor(.red)
                        }
                    }
                }
            }
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
                    }
                }
                .foregroundColor(.orange)
            } else {
                Button {
                    if let profile = authViewModel.profile {
                        groupViewModel.requestToJoin(group: group, user: profile)
                    } else if let fallback = authViewModel.currentUserProfile {
                        groupViewModel.requestToJoin(group: group, user: fallback)
                    }
                } label: {
                    Label("Request to Join", systemImage: "person.badge.plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
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
