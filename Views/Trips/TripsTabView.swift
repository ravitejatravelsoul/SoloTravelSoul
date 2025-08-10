import SwiftUI

struct TripsTabView: View {
    @EnvironmentObject var tripViewModel: TripViewModel
    @Binding var editTripID: UUID?

    struct SheetTrip: Identifiable {
        let id: UUID
    }
    @State private var sheetTrip: SheetTrip? = nil
    @State private var showCreateTrip = false      // <-- Added

    var body: some View {
        NavigationView {
            List {
                ForEach(tripViewModel.trips) { trip in
                    TripRowView(trip: trip, onEdit: {
                        sheetTrip = SheetTrip(id: trip.id)
                    })
                }
                .onDelete { indexSet in
                    for index in indexSet {
                        let trip = tripViewModel.trips[index]
                        tripViewModel.deleteTrip(trip) // <--- FIXED
                        if sheetTrip?.id == trip.id {
                            sheetTrip = nil
                        }
                    }
                }
            }
            .listStyle(PlainListStyle())
            .navigationTitle("My Trips")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showCreateTrip = true }) {
                        Image(systemName: "plus")
                            .imageScale(.large)
                    }
                    .accessibilityLabel("Add Trip")
                }
            }
            .sheet(item: $sheetTrip) { sheet in
                if let trip = tripViewModel.trips.first(where: { $0.id == sheet.id }) {
                    TripDetailView(tripViewModel: tripViewModel, trip: trip)
                } else {
                    VStack {
                        Text("Trip not found or already deleted.")
                        Button("Close") { sheetTrip = nil }
                    }
                }
            }
            .sheet(isPresented: $showCreateTrip) {
                CreateTripView()
                    .environmentObject(tripViewModel)
            }
        }
        .onChange(of: editTripID) { old, new in
            if let id = new {
                sheetTrip = SheetTrip(id: id)
                editTripID = nil // Reset so it can be triggered again
            }
        }
    }
}
