import SwiftUI

struct AddToItinerarySheet: View {
    let trips: [PlannedTrip]
    let place: Place
    @Binding var selectedTrip: PlannedTrip?
    @Binding var selectedDate: Date
    let onAddExisting: (PlannedTrip, Date, Place) -> Void
    let onAddNew: (String, String, Date, Place) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isCreatingNewTrip: Bool = false
    @State private var newTripName: String = ""
    @State private var newTripNotes: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Add to", selection: $isCreatingNewTrip) {
                        Text("Existing Trip").tag(false)
                        Text("New Trip").tag(true)
                    }
                    .pickerStyle(SegmentedPickerStyle())
                }
                if isCreatingNewTrip {
                    Section(header: Text("New Trip Name")) {
                        TextField("Trip Name", text: $newTripName)
                    }
                    Section(header: Text("Notes")) {
                        TextEditor(text: $newTripNotes)
                            .frame(height: 80)
                            .cornerRadius(8)
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.2)))
                    }
                } else {
                    Section(header: Text("Select Trip")) {
                        Picker("Trip", selection: $selectedTrip) {
                            ForEach(trips, id: \.id) { trip in
                                Text(trip.destination).tag(Optional(trip))
                            }
                        }
                    }
                }
                Section(header: Text("Select Date")) {
                    DatePicker("Date", selection: $selectedDate, displayedComponents: .date)
                }
                Section {
                    Button("Add to Itinerary") {
                        if isCreatingNewTrip {
                            if !newTripName.trimmingCharacters(in: .whitespaces).isEmpty {
                                onAddNew(newTripName, newTripNotes, selectedDate, place)
                                dismiss()
                            }
                        } else if let trip = selectedTrip {
                            onAddExisting(trip, selectedDate, place)
                            dismiss()
                        }
                    }
                    .disabled(isCreatingNewTrip
                        ? newTripName.trimmingCharacters(in: .whitespaces).isEmpty
                        : selectedTrip == nil)
                }
            }
            .navigationTitle("Add to Itinerary")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
