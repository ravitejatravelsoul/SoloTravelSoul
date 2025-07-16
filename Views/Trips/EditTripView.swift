import SwiftUI

struct EditTripView: View {
    @Environment(\.presentationMode) var presentationMode
    @Binding var trip: Trip

    var onSave: (Trip) -> Void

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Destination")) {
                    TextField("Enter destination", text: $trip.destination)
                }
                Section(header: Text("Dates")) {
                    DatePicker("Start Date", selection: $trip.startDate, displayedComponents: .date)
                    DatePicker("End Date", selection: $trip.endDate, displayedComponents: .date)
                }
                Section(header: Text("Notes")) {
                    TextField("Notes", text: $trip.notes)
                }
                Section(header: Text("Trip Type")) {
                    Picker("Type", selection: $trip.isPlanned) {
                        Text("Planned Trip").tag(true)
                        Text("Travel History").tag(false)
                    }
                    .pickerStyle(SegmentedPickerStyle())
                }
            }
            .navigationTitle("Edit Trip")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") {
                    presentationMode.wrappedValue.dismiss()
                },
                trailing: Button("Save") {
                    onSave(trip)
                    presentationMode.wrappedValue.dismiss()
                }
                .disabled(trip.destination.isEmpty)
            )
        }
    }
}
