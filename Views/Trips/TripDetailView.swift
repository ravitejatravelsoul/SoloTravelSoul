import SwiftUI

struct TripDetailView: View {
    let trip: PlannedTrip

    var body: some View {
        VStack(alignment: .leading) {
            Text(trip.destination).font(.largeTitle).bold()
            Text("From \(trip.startDate, style: .date) to \(trip.endDate, style: .date)")
                .font(.subheadline)
                .foregroundColor(.secondary)
            Divider()
            ForEach(trip.itinerary) { day in
                VStack(alignment: .leading) {
                    Text(day.date, style: .date)
                        .font(.headline)
                    ForEach(day.places) { place in
                        Text(place.name)
                            .font(.subheadline)
                            .padding(.leading)
                    }
                }
                .padding(.vertical, 4)
            }
            Spacer()
        }
        .padding()
        .navigationTitle("Trip Details")
    }
}
