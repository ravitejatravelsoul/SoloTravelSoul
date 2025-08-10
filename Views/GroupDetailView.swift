import SwiftUI

struct GroupDetailView: View {
    let group: GroupTrip
    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile
    @State private var requested = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(group.name).font(.largeTitle).bold()
            Text(group.destination).font(.title2)
            Text("\(group.startDate, style: .date) - \(group.endDate, style: .date)").font(.subheadline)
            if let desc = group.description {
                Text(desc).font(.body)
            }
            if !group.activities.isEmpty {
                Text("Activities: \(group.activities.joined(separator: ", "))")
            }
            Text("Members (\(group.members.count))")
            ForEach(group.members, id: \.id) { user in
                Text(user.name)
            }
            Spacer()
            Button(requested ? "Requested" : "Request to Join") {
                if !requested {
                    groupViewModel.requestToJoin(group: group, user: currentUser)
                    requested = true
                }
            }
            .disabled(requested)
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}
