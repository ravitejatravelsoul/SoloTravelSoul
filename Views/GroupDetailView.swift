import SwiftUI

struct GroupDetailView: View {
    let group: GroupTrip
    let currentUser: UserProfile
    @ObservedObject var groupViewModel: GroupViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(group.name)
                .font(.title)
            Text("Destination: \(group.destination)")
            Text("Dates: \(group.startDate, formatter: dateFormatter) - \(group.endDate, formatter: dateFormatter)")
            Text("Description: \(group.description ?? "No description")")
            Text("Members: \(group.members.map(\.name).joined(separator: ", "))")
            Spacer()
        }
        .padding()
        .navigationTitle("Group Details")
    }
}

private let dateFormatter: DateFormatter = {
    let df = DateFormatter()
    df.dateStyle = .medium
    return df
}()
