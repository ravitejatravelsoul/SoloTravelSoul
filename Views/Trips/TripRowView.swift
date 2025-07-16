import SwiftUI

struct TripRowView: View {
    let trip: Trip

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(trip.destination)
                    .font(.headline)
                Text("\(trip.startDate, formatter: Self.dateFormatter) - \(trip.endDate, formatter: Self.dateFormatter)")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                if !trip.notes.isEmpty {
                    Text(trip.notes)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            Spacer()
            Image(systemName: trip.isPlanned ? "airplane.departure" : "clock.arrow.circlepath")
                .foregroundColor(trip.isPlanned ? .blue : .gray)
        }
        .padding(.vertical, 4)
    }

    static let dateFormatter: DateFormatter = {
        let df = DateFormatter()
        df.dateStyle = .medium
        return df
    }()
}
