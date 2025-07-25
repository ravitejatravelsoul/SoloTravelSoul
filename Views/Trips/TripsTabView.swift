import SwiftUI

struct TripsTabView: View {
    @EnvironmentObject var tripViewModel: TripViewModel
    @Binding var editTripID: UUID?

    struct SheetTrip: Identifiable {
        let id: UUID
    }
    @State private var sheetTrip: SheetTrip? = nil

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
                        tripViewModel.deleteTrip(withId: trip.id)
                        if sheetTrip?.id == trip.id {
                            sheetTrip = nil
                        }
                    }
                }
            }
            .listStyle(PlainListStyle())
            .navigationTitle("My Trips")
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
        }
        .onChange(of: editTripID) { old, new in
            if let id = new {
                sheetTrip = SheetTrip(id: id)
                editTripID = nil // Reset so it can be triggered again
            }
        }
    }
}
