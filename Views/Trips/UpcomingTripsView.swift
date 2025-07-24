import SwiftUI

struct UpcomingTripsView: View {
    @EnvironmentObject var tripViewModel: TripViewModel
    @State private var editingTrip: PlannedTrip? = nil
    @State private var showEditor = false

    var plannedTrips: [PlannedTrip] {
        tripViewModel.trips
    }
    // If you want to support travel history, you can use a computed property here as well or extend your TripViewModel.

    var body: some View {
        NavigationView {
            List {
                Section(header: Text("Planned Trips")) {
                    if plannedTrips.isEmpty {
                        Text("No planned trips. Tap + to add one!")
                            .foregroundColor(.secondary)
                    }
                    ForEach(plannedTrips) { trip in
                        TripRowView(trip: trip)
                            .onTapGesture {
                                editingTrip = trip
                                showEditor = true
                            }
                    }
                    .onDelete { indices in
                        indices.forEach { idx in
                            let trip = plannedTrips[idx]
                            tripViewModel.deleteTrip(withId: trip.id)
                        }
                    }
                }

                // Optional: If you want travel history, implement it in TripViewModel and display here.
                // Section(header: Text("Travel History")) { ... }
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
            .sheet(isPresented: $showEditor) {
                if let trip = editingTrip {
                    PlannedTripDetailView(plannedTrip: trip) { updatedTrip in
                        saveTrip(updatedTrip)
                        showEditor = false
                    }
                }
            }
        }
    }

    func addPlannedTrip() {
        let newTrip = PlannedTrip.sampleNewPlanned()
        tripViewModel.addTrip(newTrip)
        editingTrip = newTrip
        showEditor = true
    }

    func saveTrip(_ updatedTrip: PlannedTrip) {
        tripViewModel.updateTrip(updatedTrip)
    }
}
