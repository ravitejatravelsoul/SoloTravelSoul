import SwiftUI

struct UpcomingTripsView: View {
    @State private var plannedTrips: [Trip] = Trip.samplePlannedTrips()
    @State private var travelHistory: [Trip] = Trip.sampleHistoryTrips()
    @State private var editingTrip: Trip? = nil
    @State private var showEditor = false

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
                        plannedTrips.remove(atOffsets: indices)
                    }
                }

                Section(header: Text("Travel History")) {
                    if travelHistory.isEmpty {
                        Text("No travel history yet.")
                            .foregroundColor(.secondary)
                    }
                    ForEach(travelHistory) { trip in
                        TripRowView(trip: trip)
                            .onTapGesture {
                                editingTrip = trip
                                showEditor = true
                            }
                    }
                    .onDelete { indices in
                        travelHistory.remove(atOffsets: indices)
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
            .sheet(isPresented: $showEditor) {
                if let trip = editingTrip {
                    TripDetailView(trip: trip) { updatedTrip in
                        saveTrip(updatedTrip)
                        showEditor = false
                    }
                }
            }
        }
    }

    func addPlannedTrip() {
        let newTrip = Trip.sampleNewPlanned()
        plannedTrips.append(newTrip)
        editingTrip = newTrip
        showEditor = true
    }

    func saveTrip(_ updatedTrip: Trip) {
        if updatedTrip.isPlanned {
            if let idx = plannedTrips.firstIndex(where: { $0.id == updatedTrip.id }) {
                plannedTrips[idx] = updatedTrip
            } else {
                plannedTrips.append(updatedTrip)
                // Remove from history if moved from history
                travelHistory.removeAll { $0.id == updatedTrip.id }
            }
        } else {
            if let idx = travelHistory.firstIndex(where: { $0.id == updatedTrip.id }) {
                travelHistory[idx] = updatedTrip
            } else {
                travelHistory.append(updatedTrip)
                // Remove from planned if moved from planned
                plannedTrips.removeAll { $0.id == updatedTrip.id }
            }
        }
    }
}
