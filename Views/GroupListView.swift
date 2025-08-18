import SwiftUI

struct GroupListView: View {
    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile        // RootTabView supplies this
    @EnvironmentObject var authViewModel: AuthViewModel

    @State private var showCreate = false
    @State private var search = ""
    @State private var joiningGroupID: String? = nil
    @State private var cancellingGroupID: String? = nil

    @State private var showDetail = false
    @State private var selectedGroup: GroupTrip?

    private var filtered: [GroupTrip] {
        let trimmed = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return groupViewModel.groups }
        return groupViewModel.groups.filter {
            $0.name.localizedCaseInsensitiveContains(trimmed) ||
            $0.destination.localizedCaseInsensitiveContains(trimmed)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if filtered.isEmpty {
                    List {
                        Text("No groups found.")
                            .foregroundColor(.secondary)
                    }
                } else {
                    List {
                        ForEach(filtered) { group in
                            GroupRow(
                                group: group,
                                currentUser: currentUser,
                                groupViewModel: groupViewModel,
                                requestAction: { requestJoin(group) },
                                cancelAction: { cancelJoin(group) }
                            )
                            .contentShape(Rectangle())
                            .onTapGesture {
                                selectedGroup = group
                                showDetail = true
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                // REMOVE delete for creator here; handled in detail view
                                // Only allow join/cancel in list
                                if isMember(group) {
                                    // Optionally add a leave action here
                                } else if isPending(group) {
                                    Button(role: .destructive) {
                                        cancelJoin(group)
                                    } label: {
                                        Label("Cancel", systemImage: "xmark")
                                    }
                                } else {
                                    Button {
                                        requestJoin(group)
                                    } label: {
                                        Label("Join", systemImage: "person.badge.plus")
                                    }
                                    .tint(.blue)
                                }
                            }
                        }
                    }
                }
            }
            .searchable(text: $search)
            .navigationTitle("Groups")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showCreate = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showCreate) {
                CreateGroupSheet(groupViewModel: groupViewModel)
                    .environmentObject(authViewModel)
            }
            .sheet(isPresented: $showDetail, onDismiss: {
                selectedGroup = nil
            }) {
                if let group = selectedGroup {
                    NavigationView {
                        GroupDetailView(groupViewModel: groupViewModel, group: group)
                            .environmentObject(authViewModel)
                    }
                }
            }
        }
        .onAppear {
            groupViewModel.fetchAllGroups()
        }
    }

    // MARK: - Membership Helpers
    private func isMember(_ group: GroupTrip) -> Bool {
        group.members.contains(where: { $0.id == currentUser.id })
    }

    private func isPending(_ group: GroupTrip) -> Bool {
        group.requests.contains(where: { $0.id == currentUser.id }) ||
        group.joinRequests.contains(currentUser.id)
    }

    // MARK: - Actions
    private func requestJoin(_ group: GroupTrip) {
        guard !isMember(group), !isPending(group) else { return }
        joiningGroupID = group.id
        groupViewModel.requestToJoin(group: group, user: currentUser)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            joiningGroupID = nil
        }
    }

    private func cancelJoin(_ group: GroupTrip) {
        guard isPending(group) else { return }
        cancellingGroupID = group.id
        groupViewModel.cancelJoinRequest(group: group, userId: currentUser.id)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            cancellingGroupID = nil
        }
    }
}

// MARK: - Group Row

private struct GroupRow: View {
    let group: GroupTrip
    let currentUser: UserProfile
    let groupViewModel: GroupViewModel
    let requestAction: () -> Void
    let cancelAction: () -> Void

    @EnvironmentObject var authViewModel: AuthViewModel

    private var isCreator: Bool { currentUser.id == group.creator.id }
    private var isMember: Bool { group.members.contains(where: { $0.id == currentUser.id }) }
    private var isPending: Bool {
        group.requests.contains(where: { $0.id == currentUser.id }) ||
        group.joinRequests.contains(currentUser.id)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(group.name)
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
                statusBadge
            }
            Text(group.destination)
                .font(.caption)
                .foregroundColor(.secondary)
            HStack(spacing: 8) {
                Label("\(group.members.count)", systemImage: "person.3.fill")
                    .font(.caption2)
                    .foregroundColor(.blue)
                Text(dateRangeString(from: group.startDate, to: group.endDate))
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            if !isMember && !isCreator {
                actionRow
            }
        }
        .padding(.vertical, 4)
    }

    // Status Badge
    @ViewBuilder
    private var statusBadge: some View {
        if isCreator {
            badge(text: "Owner", color: .yellow, system: "crown.fill")
        } else if isMember {
            badge(text: "Member", color: .green, system: "checkmark.seal.fill")
        } else if isPending {
            badge(text: "Pending", color: .orange, system: "hourglass")
        }
    }

    private func badge(text: String, color: Color, system: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: system)
            Text(text).font(.caption2)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.15))
        .foregroundColor(color)
        .clipShape(Capsule())
    }

    // Join / Cancel row
    @ViewBuilder
    private var actionRow: some View {
        HStack {
            if isPending {
                Button(role: .destructive) {
                    cancelAction()
                } label: {
                    Label("Cancel", systemImage: "xmark.circle")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .tint(.orange)
            } else {
                Button {
                    requestAction()
                } label: {
                    Label("Join", systemImage: "person.badge.plus")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
            }
            Spacer()
        }
    }

    private func dateRangeString(from start: Date, to end: Date) -> String {
        let df = DateFormatter()
        df.dateStyle = .short
        return "\(df.string(from: start)) - \(df.string(from: end))"
    }
}

// MARK: - Create Group Sheet (same as before)

struct CreateGroupSheet: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var authViewModel: AuthViewModel
    @ObservedObject var groupViewModel: GroupViewModel

    @State private var name = ""
    @State private var destination = ""
    @State private var startDate = Date()
    @State private var endDate = Calendar.current.date(byAdding: .day, value: 2, to: Date())!
    @State private var descriptionText = ""
    @State private var activitiesText = ""
    @State private var creating = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Basics") {
                    TextField("Group Name", text: $name)
                    TextField("Destination", text: $destination)
                }
                Section("Dates") {
                    DatePicker("Start", selection: $startDate, displayedComponents: .date)
                    DatePicker("End", selection: $endDate, in: startDate..., displayedComponents: .date)
                }
                Section("Description") {
                    TextEditor(text: $descriptionText)
                        .frame(height: 100)
                }
                Section("Activities (comma separated)") {
                    TextField("e.g. Hiking, Museums", text: $activitiesText)
                }
            }
            .disabled(creating)
            .navigationTitle("New Group")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(creating)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        guard
                            !name.trimmingCharacters(in: .whitespaces).isEmpty,
                            !destination.trimmingCharacters(in: .whitespaces).isEmpty,
                            let creator = authViewModel.profile ?? authViewModel.currentUserProfile
                        else { return }
                        creating = true
                        let activities = activitiesText
                            .split(separator: ",")
                            .map { $0.trimmingCharacters(in: .whitespaces) }
                        groupViewModel.createGroup(
                            name: name,
                            destination: destination,
                            startDate: startDate,
                            endDate: endDate,
                            description: descriptionText.isEmpty ? nil : descriptionText,
                            activities: activities,
                            creator: creator
                        )
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                            creating = false
                            dismiss()
                        }
                    } label: {
                        if creating {
                            ProgressView()
                        } else {
                            Label("Create", systemImage: "checkmark")
                        }
                    }
                    .disabled(
                        name.trimmingCharacters(in: .whitespaces).isEmpty ||
                        destination.trimmingCharacters(in: .whitespaces).isEmpty
                    )
                }
            }
        }
    }
}
