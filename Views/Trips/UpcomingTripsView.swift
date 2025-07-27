import SwiftUI

struct UpcomingTripsView: View {
    @EnvironmentObject var tripViewModel: TripViewModel

    struct EditingTrip: Identifiable {
        let id: UUID
    }
    @State private var editingTrip: EditingTrip? = nil

    var plannedTrips: [PlannedTrip] {
        tripViewModel.trips
    }

    var body: some View {
        NavigationView {
            List {
                Section(header: Text("Planned Trips")) {
                    if plannedTrips.isEmpty {
                        Text("No planned trips. Tap + to add one!")
                            .foregroundColor(.secondary)
                    }
                    ForEach(plannedTrips) { trip in
                        TripRowView(trip: trip, onEdit: {
                            editingTrip = EditingTrip(id: trip.id)
                        })
                    }
                    .onDelete { indices in
                        indices.forEach { idx in
                            let trip = plannedTrips[idx]
                            tripViewModel.deleteTrip(withId: trip.id)
                            if editingTrip?.id == trip.id {
                                editingTrip = nil
                            }
                        }
                    }
                }
            }
            .listStyle(InsetGroupedListStyle())
            .navigationTitle("Trips")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: addPlannedTrip) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(item: $editingTrip) { item in
                if let index = plannedTrips.firstIndex(where: { $0.id == item.id }) {
                    EditTripView(
                        trip: $tripViewModel.trips[index],
                        onSave: { updatedTrip in
                            saveTrip(updatedTrip)
                            editingTrip = nil
                        },
                        tripViewModel: tripViewModel
                    )
                } else {
                    VStack {
                        Text("Trip not found or already deleted.")
                        Button("Close") { editingTrip = nil }
                    }
                }
            }
        }
    }

    func addPlannedTrip() {
        let newTrip = PlannedTrip.sampleNewPlanned()
        tripViewModel.addTrip(newTrip)
        editingTrip = EditingTrip(id: newTrip.id)
    }

    func saveTrip(_ updatedTrip: PlannedTrip) {
        tripViewModel.updateTrip(updatedTrip)
    }
}
