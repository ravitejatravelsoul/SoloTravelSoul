import SwiftUI

struct TripDetailView: View {
    @State var trip: Trip
    var onSave: (Trip) -> Void
    @Environment(\.presentationMode) var presentationMode

    var body: some View {
        NavigationView {
            Form {
                TextField("Destination", text: $trip.destination)
                DatePicker("Start Date", selection: $trip.startDate, displayedComponents: .date)
                DatePicker("End Date", selection: $trip.endDate, displayedComponents: .date)
                TextField("Notes", text: $trip.notes)
                Picker("Type", selection: $trip.isPlanned) {
                    Text("Planned Trip").tag(true)
                    Text("Travel History").tag(false)
                }
                .pickerStyle(SegmentedPickerStyle())
            }
            .navigationTitle("Trip Details")
            .navigationBarItems(trailing: Button("Save") {
                onSave(trip)
                presentationMode.wrappedValue.dismiss()
            })
        }
    }
}
