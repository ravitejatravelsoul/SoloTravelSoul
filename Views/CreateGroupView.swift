import SwiftUI

struct CreateGroupView: View {
    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile
    @Environment(\.dismiss) var dismiss
    @State private var name = ""
    @State private var destination = ""
    @State private var startDate = Date()
    @State private var endDate = Date()
    @State private var description = ""
    @State private var activities = ""

    var body: some View {
        NavigationView {
            Form {
                TextField("Group Name", text: $name)
                TextField("Destination", text: $destination)
                DatePicker("Start Date", selection: $startDate)
                DatePicker("End Date", selection: $endDate)
                TextField("Description", text: $description)
                TextField("Activities (comma separated)", text: $activities)
            }
            .navigationTitle("Create Group")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        groupViewModel.createGroup(
                            name: name,
                            destination: destination,
                            startDate: startDate,
                            endDate: endDate,
                            description: description,
                            activities: activities.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) },
                            creator: currentUser
                        )
                        dismiss()
                    }
                    .disabled(name.isEmpty || destination.isEmpty)
                }
            }
        }
    }
}
