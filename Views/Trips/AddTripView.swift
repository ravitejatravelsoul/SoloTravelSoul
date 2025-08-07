import SwiftUI

struct AddTripView: View {
    @Environment(\.presentationMode) var presentationMode
    @State private var destination: String = ""
    @State private var startDate: Date = Date()
    @State private var endDate: Date = Date().addingTimeInterval(86400)
    @State private var notes: String = ""
    // Remove isPlanned: all trips created here are PlannedTrip

    var onSave: (PlannedTrip) -> Void

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Destination")) {
                    TextField("Enter destination", text: $destination)
                }
                Section(header: Text("Dates")) {
                    DatePicker("Start Date", selection: $startDate, displayedComponents: .date)
                    DatePicker("End Date", selection: $endDate, displayedComponents: .date)
                }
                Section(header: Text("Notes")) {
                    TextField("Notes", text: $notes)
                }
            }
            .navigationTitle("Add Trip")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") {
                    presentationMode.wrappedValue.dismiss()
                },
                trailing: Button("Save") {
                    let newTrip = PlannedTrip(
                        id: UUID(),
                        destination: destination,
                        startDate: startDate,
                        endDate: endDate,
                        notes: notes,
                        itinerary: [],
                        photoData: nil,
                        latitude: nil,
                        longitude: nil,
                        placeName: nil,
                        members: [] // <-- Added members argument
                    )
                    onSave(newTrip)
                    presentationMode.wrappedValue.dismiss()
                }
                .disabled(destination.isEmpty)
            )
        }
    }
}
