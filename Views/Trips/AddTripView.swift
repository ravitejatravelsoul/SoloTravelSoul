import SwiftUI

struct AddTripView: View {
    @Environment(\.presentationMode) var presentationMode
    @State private var destination: String = ""
    @State private var startDate: Date = Date()
    @State private var endDate: Date = Date().addingTimeInterval(86400)
    @State private var notes: String = ""
    @State private var isPlanned: Bool = true

    var onSave: (Trip) -> Void

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
                Section(header: Text("Trip Type")) {
                    Picker("Type", selection: $isPlanned) {
                        Text("Planned Trip").tag(true)
                        Text("Travel History").tag(false)
                    }
                    .pickerStyle(SegmentedPickerStyle())
                }
            }
            .navigationTitle("Add Trip")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") {
                    presentationMode.wrappedValue.dismiss()
                },
                trailing: Button("Save") {
                    let newTrip = Trip(
                        id: UUID(),
                        destination: destination,
                        startDate: startDate,
                        endDate: endDate,
                        notes: notes,
                        isPlanned: isPlanned
                    )
                    onSave(newTrip)
                    presentationMode.wrappedValue.dismiss()
                }
                .disabled(destination.isEmpty)
            )
        }
    }
}
