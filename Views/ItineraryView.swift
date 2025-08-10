import SwiftUI

struct ItineraryView: View {
    let trips: [PlannedTrip]

    var body: some View {
        List(trips) { trip in
            VStack(alignment: .leading) {
                Text(trip.destination)
                    .font(.headline)
                Text("\(trip.startDate, formatter: DateFormatter.short) - \(trip.endDate, formatter: DateFormatter.short)")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                if !trip.notes.isEmpty {
                    Text(trip.notes)
                        .font(.footnote)
                        .foregroundColor(.gray)
                }
            }
            .padding(.vertical, 4)
        }
        .navigationTitle("Trip Itinerary")
    }
}

extension DateFormatter {
    static let short: DateFormatter = {
        let df = DateFormatter()
        df.dateStyle = .short
        return df
    }()
}

struct ItineraryView_Previews: PreviewProvider {
    static var previews: some View {
        ItineraryView(trips: [
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
                placeName: nil,
                members: []
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
                placeName: nil,
                members: []
            )
        ])
    }
}
