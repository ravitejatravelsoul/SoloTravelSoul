import SwiftUI

struct RecentTripsView: View {
    let trips: [PlannedTrip]
    var onEditTrip: ((PlannedTrip) -> Void)? = nil

    var body: some View {
        if trips.isEmpty {
            EmptyView() // or a Text("No recent trips") if you want
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16) {
                    ForEach(trips.prefix(10)) { trip in
                        VStack(alignment: .leading, spacing: 6) {
                            // --- Trip Image or Placeholder ---
                            Group {
                                if let data = trip.photoData, let uiImage = UIImage(data: data) {
                                    Image(uiImage: uiImage)
                                        .resizable()
                                        .scaledToFill()
                                } else {
                                    Image("trip_placeholder")
                                        .resizable()
                                        .scaledToFill()
                                }
                            }
                            .frame(width: 60, height: 60)
                            .clipped()
                            .cornerRadius(8)

                            // --- Trip Destination ---
                            Text(trip.destination)
                                .font(.subheadline)
                                .lineLimit(1)
                                .foregroundColor(AppTheme.textPrimary)

                            // --- Trip Dates ---
                            Text(DateFormatter.localizedString(from: trip.startDate, dateStyle: .short, timeStyle: .none))
                                .font(.caption)
                                .foregroundColor(AppTheme.textSecondary)

                            // --- Edit Button ---
                            Button("Edit") {
                                onEditTrip?(trip)
                            }
                            .font(.caption)
                            .buttonStyle(.bordered)
                        }
                        .frame(width: 80)
                        .background(AppTheme.card)
                        .cornerRadius(10)
                        .shadow(color: AppTheme.shadow, radius: 1)
                    }
                }
                .padding(.horizontal)
            }
        }
    }
}
