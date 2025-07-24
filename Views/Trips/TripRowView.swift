import SwiftUI

struct TripRowView: View {
    let trip: PlannedTrip

    var body: some View {
        VStack(alignment: .leading) {
            Text(trip.destination)
                .font(.headline)
            Text("Start: \(trip.startDate, formatter: dateFormatter)")
                .font(.subheadline)
            Text("End: \(trip.endDate, formatter: dateFormatter)")
                .font(.subheadline)
        }
    }

    private var dateFormatter: DateFormatter {
        let df = DateFormatter()
        df.dateStyle = .medium
        return df
    }
}
