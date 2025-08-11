import SwiftUI

struct GroupListView: View {
    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile

    @State private var searchText = ""
    @State private var selectedGroup: GroupTrip? = nil

    var filteredGroups: [GroupTrip] {
        if searchText.isEmpty {
            return groupViewModel.groups
        } else {
            return groupViewModel.groups.filter {
                $0.name.localizedCaseInsensitiveContains(searchText) ||
                $0.destination.localizedCaseInsensitiveContains(searchText)
            }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(filteredGroups) { group in
                    NavigationLink(destination: GroupDetailView(group: group, currentUser: currentUser, groupViewModel: groupViewModel)) {
                        VStack(alignment: .leading) {
                            Text(group.name)
                                .font(.headline)
                            Text(group.destination)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
            .searchable(text: $searchText)
            .navigationTitle("Groups")
        }
    }
}
