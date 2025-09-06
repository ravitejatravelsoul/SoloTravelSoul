import SwiftUI

struct GroupListView: View {
    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile
    @EnvironmentObject var authViewModel: AuthViewModel

    @State private var showCreate = false
    @State private var search = ""
    @State private var selectedGroup: GroupTrip?

    // --- Sectioned Group Logic ---
    private var recommendedGroups: [GroupTrip] {
        let userPrefs = currentUser.preferences.map { $0.lowercased().trimmingCharacters(in: .whitespaces) }
        let userFavDests = currentUser.favoriteDestinations.map { $0.lowercased().trimmingCharacters(in: .whitespaces) }
        let userLangs = currentUser.languages.map { $0.lowercased().trimmingCharacters(in: .whitespaces) }
        let all = groupViewModel.groups

        // Always include groups where user is creator or member
        let alwaysInclude: [GroupTrip] = all.filter {
            $0.creator.id == currentUser.id || $0.members.contains(where: { $0.id == currentUser.id })
        }

        // Add groups matching preferences (not already included)
        let matched: [GroupTrip] = all.filter { group in
            if alwaysInclude.contains(where: { $0.id == group.id }) { return false }
            let groupDest = group.destination.lowercased().trimmingCharacters(in: .whitespaces)
            let groupActs = (group.activities ?? []).map { $0.lowercased().trimmingCharacters(in: .whitespaces) }
            let groupLangs = (group.languages ?? []).map { $0.lowercased().trimmingCharacters(in: .whitespaces) }
            let destMatch = userFavDests.contains(where: { groupDest.contains($0) })
            let actMatch = groupActs.contains(where: { userPrefs.contains($0) })
            let langMatch = groupLangs.contains(where: { userLangs.contains($0) })
            return destMatch || actMatch || langMatch
        }

        return (alwaysInclude + matched).removingDuplicates()
    }

    private var otherGroups: [GroupTrip] {
        let recommendedIds = Set(recommendedGroups.map { $0.id })
        return groupViewModel.groups.filter { !recommendedIds.contains($0.id) }
    }

    // --- Search logic (filters both sections) ---
    private var searchedRecommended: [GroupTrip] {
        let trimmed = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return recommendedGroups }
        return recommendedGroups.filter {
            $0.name.localizedCaseInsensitiveContains(trimmed)
            || $0.destination.localizedCaseInsensitiveContains(trimmed)
        }
    }
    private var searchedOther: [GroupTrip] {
        let trimmed = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return otherGroups }
        return otherGroups.filter {
            $0.name.localizedCaseInsensitiveContains(trimmed)
            || $0.destination.localizedCaseInsensitiveContains(trimmed)
        }
    }

    var body: some View {
        NavigationStack {
            VStack {
                if searchedRecommended.isEmpty && searchedOther.isEmpty {
                    Text("No groups found.")
                        .foregroundColor(.secondary)
                        .padding(.top, 64)
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 24) {
                            if !searchedRecommended.isEmpty {
                                Text("Recommended & Your Groups")
                                    .font(.title3.bold())
                                    .padding(.leading)
                                    .padding(.top, 12)
                                ForEach(searchedRecommended) { group in
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
                            if !searchedOther.isEmpty {
                                Text("Other Groups (Outside Your Preferences)")
                                    .font(.title3.bold())
                                    .padding(.leading)
                                    .padding(.top, searchedRecommended.isEmpty ? 12 : 0)
                                ForEach(searchedOther) { group in
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
            groupViewModel.removeGroupsListener()
            groupViewModel.fetchAllGroupsAndFilter(for: currentUser)
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

// Helper to remove duplicates by ID
extension Array where Element: Identifiable {
    func removingDuplicates() -> [Element] {
        var seen = Set<Element.ID>()
        return self.filter { seen.insert($0.id).inserted }
    }
}

// MARK: - GroupRecommendationCard

private struct GroupRecommendationCard: View {
    let group: GroupTrip

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(group.name)
                .font(.headline)
                .foregroundColor(.primary)
                .lineLimit(1)
            Text(group.destination)
                .font(.subheadline)
                .foregroundColor(.secondary)
            if let activities = group.activities, !activities.isEmpty {
                Text(activities.joined(separator: ", "))
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            if let languages = group.languages, !languages.isEmpty {
                Text("Languages: \(languages.joined(separator: ", "))")
                    .font(.caption2)
                    .foregroundColor(.purple)
                    .lineLimit(1)
            }
            HStack {
                Label("\(group.members.count)", systemImage: "person.3.fill")
                    .font(.caption2)
                    .foregroundColor(.blue)
                Spacer()
                Text(dateRangeString(from: group.startDate, to: group.endDate))
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.white)
                .shadow(color: Color.black.opacity(0.08), radius: 6, x: 0, y: 2)
        )
    }

    private func dateRangeString(from start: Date, to end: Date) -> String {
        let df = DateFormatter()
        df.dateStyle = .short
        return "\(df.string(from: start)) - \(df.string(from: end))"
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
                    if let languages = group.languages, !languages.isEmpty {
                        Text("Languages: \(languages.joined(separator: ", "))")
                            .font(.caption2)
                            .foregroundColor(.purple)
                            .lineLimit(1)
                    }
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
    @State private var languagesText = ""
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
                Section("Languages (comma separated)") {
                    TextField("e.g. English, Spanish", text: $languagesText)
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
                        let languages = languagesText
                            .split(separator: ",")
                            .map { $0.trimmingCharacters(in: .whitespaces) }
                        groupViewModel.createGroup(
                            name: name,
                            destination: destination,
                            startDate: startDate,
                            endDate: endDate,
                            description: descriptionText.isEmpty ? nil : descriptionText,
                            activities: activities,
                            languages: languages,
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
