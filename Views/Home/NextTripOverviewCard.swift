import SwiftUI

struct NextTripOverviewCard: View {
    var trip: PlannedTrip
    var onEdit: (() -> Void)? = nil

    var daysLeft: Int {
        let today = Calendar.current.startOfDay(for: Date())
        let tripStart = Calendar.current.startOfDay(for: trip.startDate)
        let diff = Calendar.current.dateComponents([.day], from: today, to: tripStart).day ?? 0
        return max(diff, 0)
    }

    var dateRange: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return "\(formatter.string(from: trip.startDate)) – \(formatter.string(from: trip.endDate))"
    }

    var body: some View {
        HStack(spacing: 16) {
            Image("trip_placeholder")
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 80, height: 80)
                .cornerRadius(12)
                .shadow(radius: 3)

            VStack(alignment: .leading, spacing: 6) {
                Text(trip.destination)
                    .font(.title3)
                    .fontWeight(.semibold)

                Text(dateRange)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                if daysLeft > 0 {
                    Text("\(daysLeft) days left!")
                        .font(.caption)
                        .foregroundColor(.accentColor)
                } else if trip.startDate <= Date() && trip.endDate >= Date() {
                    Text("Trip started!")
                        .font(.caption)
                        .foregroundColor(.accentColor)
                } else {
                    Text("Trip completed!")
                        .font(.caption)
                        .foregroundColor(.green)
                }

                Text(trip.notes)
                    .font(.caption)
                    .foregroundColor(.secondary)

                HStack(spacing: 10) {
                    Button("View Details") { }
                        .buttonStyle(.borderedProminent)

                    Button("Edit Trip") {
                        onEdit?()
                    }
                    .buttonStyle(.bordered)
                }
            }
            Spacer()
        }
        .padding()
        .background(Color(.systemBackground).opacity(0.9))
        .cornerRadius(16)
        .shadow(radius: 2)
        .padding(.horizontal)
    }
}

struct NextTripOverviewCard_Previews: PreviewProvider {
    static var previews: some View {
        NextTripOverviewCard(
            trip: PlannedTrip(
                id: UUID(),
                destination: "Paris",
                startDate: Date(),
                endDate: Calendar.current.date(byAdding: .day, value: 4, to: Date())!,
                notes: "Sample Paris trip",
                itinerary: []
            ),
            onEdit: { print("Edit pressed") }
        )
        .previewLayout(.sizeThatFits)
    }
}
