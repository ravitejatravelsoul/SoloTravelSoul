import SwiftUI

struct GroupListView: View {
    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile
    @State private var showCreateGroup = false
    @State private var selectedGroup: GroupTrip? = nil

    var body: some View {
        NavigationView {
            List {
                ForEach(groupViewModel.groups) { group in
                    Button {
                        selectedGroup = group
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(group.name).font(.headline)
                                Text(group.destination).font(.subheadline)
                                Text("\(group.startDate, style: .date) - \(group.endDate, style: .date)").font(.caption)
                            }
                            Spacer()
                            Text("\(group.members.count) members")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Trip Groups")
            .toolbar {
                Button(action: { showCreateGroup = true }) {
                    Image(systemName: "plus")
                }
            }
            .sheet(isPresented: $showCreateGroup) {
                CreateGroupView(groupViewModel: groupViewModel, currentUser: currentUser)
            }
            .sheet(item: $selectedGroup) { group in
                GroupDetailView(group: group, groupViewModel: groupViewModel, currentUser: currentUser)
            }
        }
    }
}
