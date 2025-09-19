import SwiftUI

struct TripListView: View {
    @ObservedObject var tripViewModel: TripViewModel

    var body: some View {
        NavigationStack {
            List {
                if tripViewModel.trips.isEmpty {
                    Text("No trips yet. Tap + to add your first trip!")
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                } else {
                    ForEach(tripViewModel.trips) { trip in
                        NavigationLink(destination: TripDetailView(tripViewModel: tripViewModel, trip: trip)) {
                            VStack(alignment: .leading) {
                                Text(trip.destination)
                                    .font(.headline)
                                    .bold()
                                Text("\(trip.startDate, style: .date) - \(trip.endDate, style: .date)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Your Trips")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        let newTrip = PlannedTrip(
                            id: UUID(),
                            destination: "New Destination",
                            startDate: Date(),
                            endDate: Date(),
                            notes: "",
                            itinerary: [],
                            photoData: nil,
                            latitude: nil,
                            longitude: nil,
                            placeName: nil
                        )
                        tripViewModel.trips.append(newTrip)
                    }) {
                        Image(systemName: "plus")
                    }
                }
            }
        }
    }
}
