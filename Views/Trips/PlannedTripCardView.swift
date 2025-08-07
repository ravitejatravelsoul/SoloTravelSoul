import SwiftUI

struct PlannedTripCardView: View {
    let trip: PlannedTrip

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let data = trip.photoData, let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 80)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .cornerRadius(10)
            } else {
                Color.gray.opacity(0.1)
                    .frame(height: 80)
                    .frame(maxWidth: .infinity)
                    .cornerRadius(10)
                    .overlay(Image(systemName: "photo"))
            }
            Text(trip.destination)
                .font(.headline)
                .lineLimit(1)
            Text("\(trip.startDate, formatter: dateFormatter) - \(trip.endDate, formatter: dateFormatter)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.systemBackground)))
        .shadow(color: Color.black.opacity(0.05), radius: 2, x: 0, y: 2)
        .frame(width: 140)
    }

    private var dateFormatter: DateFormatter {
        let df = DateFormatter()
        df.dateStyle = .short
        return df
    }
}
