import SwiftUI

struct RecentTripsView: View {
    let trips: [PlannedTrip]
    var onEditTrip: ((PlannedTrip) -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Recent Trips")
                .font(.headline)
                .padding(.leading)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16) {
                    ForEach(trips.prefix(10)) { trip in
                        VStack(alignment: .leading, spacing: 4) {
                            Image("trip_placeholder")
                                .resizable()
                                .frame(width: 60, height: 60)
                                .cornerRadius(8)
                            Text(trip.destination)
                                .font(.subheadline)
                                .lineLimit(1)
                            Text(DateFormatter.localizedString(from: trip.startDate, dateStyle: .short, timeStyle: .none))
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Button("Edit") {
                                onEditTrip?(trip)
                            }
                            .font(.caption)
                            .buttonStyle(.bordered)
                        }
                        .frame(width: 80)
                        .background(Color(.systemGray6))
                        .cornerRadius(10)
                        .shadow(radius: 1)
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding(.vertical)
    }
}

struct RecentTripsView_Previews: PreviewProvider {
    static var previews: some View {
        RecentTripsView(
            trips: [
                PlannedTrip(
                    id: UUID(),
                    destination: "Paris",
                    startDate: Date(),
                    endDate: Calendar.current.date(byAdding: .day, value: 4, to: Date())!,
                    notes: "Sample Paris trip",
                    itinerary: [],
                    photoData: nil,
                    latitude: nil,
                    longitude: nil,
                    placeName: "Eiffel Tower",
                    members: ["Alice", "Bob", "Charlie"]
                ),
                PlannedTrip(
                    id: UUID(),
                    destination: "London",
                    startDate: Date(),
                    endDate: Calendar.current.date(byAdding: .day, value: 7, to: Date())!,
                    notes: "Sample London trip",
                    itinerary: [],
                    photoData: nil,
                    latitude: nil,
                    longitude: nil,
                    placeName: "Big Ben",
                    members: ["Diana", "Eve"]
                )
            ],
            onEditTrip: { _ in print("Edit trip pressed") }
        )
        .previewLayout(.sizeThatFits)
    }
}
