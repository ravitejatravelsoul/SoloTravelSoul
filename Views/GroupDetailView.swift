import SwiftUI

struct GroupDetailView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @ObservedObject var groupViewModel: GroupViewModel
    let group: GroupTrip

    @State private var showRequests = false
    @State private var showLinkTripSheet = false
    @State private var tripIdToLink: String = ""

    var isCreator: Bool {
        authViewModel.user?.uid == group.creator.id
    }

    var isMember: Bool {
        guard let uid = authViewModel.user?.uid else { return false }
        return group.members.contains(where: { $0.id == uid })
    }

    var hasRequested: Bool {
        guard let uid = authViewModel.user?.uid else { return false }
        return group.requests.contains(where: { $0.id == uid }) || group.joinRequests.contains(uid)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
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

                if !group.activities.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Activities")
                            .font(.headline)
                        ForEach(group.activities, id: \.self) { act in
                            HStack {
                                Image(systemName: "checkmark.circle")
                                    .foregroundColor(.blue)
                                Text(act)
                            }
                            .font(.subheadline)
                        }
                    }
                }

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Text("Members (\(group.members.count))")
                        .font(.headline)
                    ForEach(group.members, id: \.id) { member in
                        HStack {
                            Image(systemName: member.id == group.creator.id ? "crown.fill" : "person.circle")
                                .foregroundColor(member.id == group.creator.id ? .yellow : .blue)
                            Text(member.name)
                            if member.id == group.creator.id {
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

                if isCreator {
                    creatorRequestSection
                } else {
                    joinControlsSection
                }

                linkedTripsSection
            }
            .padding()
        }
        .navigationTitle("Group")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showLinkTripSheet) {
            NavigationStack {
                Form {
                    Section("Link Trip by ID") {
                        TextField("Trip ID", text: $tripIdToLink)
                        Button("Link Trip") {
                            if !tripIdToLink.trimmingCharacters(in: .whitespaces).isEmpty {
                                groupViewModel.linkTrip(group: group, tripId: tripIdToLink.trimmingCharacters(in: .whitespaces))
                                tripIdToLink = ""
                            }
                        }
                        .disabled(tripIdToLink.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { showLinkTripSheet = false }
                    }
                }
            }
        }
    }

    @ViewBuilder
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

    @ViewBuilder
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

    @ViewBuilder
    private var linkedTripsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Linked Trips")
                    .font(.headline)
                Spacer()
                if isCreator {
                    Button {
                        showLinkTripSheet = true
                    } label: {
                        Image(systemName: "link")
                    }
                }
            }
            if group.linkedTripIDs.isEmpty {
                Text("No trips linked yet.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                ForEach(group.linkedTripIDs, id: \.self) { tripId in
                    HStack {
                        Image(systemName: "airplane")
                        Text("Trip ID: \(tripId)")
                        Spacer()
                        if isCreator {
                            Button(role: .destructive) {
                                groupViewModel.unlinkTrip(group: group, tripId: tripId)
                            } label: {
                                Image(systemName: "trash")
                            }
                        }
                    }
                }
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
