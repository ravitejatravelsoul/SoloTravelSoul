import SwiftUI

struct GroupListView: View {
    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile        // RootTabView supplies this
    @EnvironmentObject var authViewModel: AuthViewModel

    @State private var showCreate = false
    @State private var search = ""
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
            VStack {
                if filtered.isEmpty {
                    Text("No groups found.")
                        .foregroundColor(.secondary)
                        .padding(.top, 64)
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 18) {
                            ForEach(filtered) { group in
                                Button {
                                    selectedGroup = group
                                } label: {
                                    GroupRow(
                                        group: group,
                                        currentUser: currentUser,
                                        groupViewModel: groupViewModel,
                                        requestAction: { requestJoin(group) },
                                        cancelAction: { cancelJoin(group) }
                                    )
                                    .padding(.horizontal)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.top, 16)
                        .padding(.bottom, 24)
                    }
                }
            }
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .searchable(text: $search)
            .navigationTitle("Groups")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showCreate = true
                    } label: {
                        Image(systemName: "plus")
                            .imageScale(.large)
                    }
                }
            }
            .sheet(isPresented: $showCreate) {
                CreateGroupSheet(groupViewModel: groupViewModel)
                    .environmentObject(authViewModel)
            }
            .sheet(item: $selectedGroup) { group in
                NavigationView {
                    GroupDetailView(groupViewModel: groupViewModel, group: group)
                        .environmentObject(authViewModel)
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
        groupViewModel.requestToJoin(group: group, user: currentUser)
    }

    private func cancelJoin(_ group: GroupTrip) {
        guard isPending(group) else { return }
        groupViewModel.cancelJoinRequest(group: group, userId: currentUser.id)
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
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(group.name)
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    Text(group.destination)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                Spacer()
                if isCreator {
                    roleBadge(text: "Owner", color: .yellow, icon: "crown.fill")
                } else if isMember {
                    roleBadge(text: "Member", color: .green, icon: "checkmark.seal.fill")
                } else if isPending {
                    roleBadge(text: "Pending", color: .orange, icon: "hourglass")
                }
            }
            HStack(spacing: 14) {
                Label("\(group.members.count)", systemImage: "person.3.fill")
                    .font(.subheadline)
                    .foregroundColor(.blue)
                Text(dateRangeString(from: group.startDate, to: group.endDate))
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            if !isMember && !isCreator {
                actionRow
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 18)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white)
                .shadow(color: Color.black.opacity(0.06), radius: 4, x: 0, y: 2)
        )
    }

    private func roleBadge(text: String, color: Color, icon: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
            Text(text)
                .font(.caption)
                .fontWeight(.semibold)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(color.opacity(0.15))
        .foregroundColor(color)
        .clipShape(Capsule())
    }

    private func dateRangeString(from start: Date, to end: Date) -> String {
        let df = DateFormatter()
        df.dateFormat = "M/d/yy"
        return "\(df.string(from: start)) - \(df.string(from: end))"
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
}

// MARK: - Create Group Sheet

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
