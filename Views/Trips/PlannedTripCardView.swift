import SwiftUI

fileprivate func googlePlacePhotoURL(photoReference: String, maxWidth: Int = 400) -> URL? {
    let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU"
    var components = URLComponents(string: "https://places.googleapis.com/v1/\(photoReference)/media")
    components?.queryItems = [
        URLQueryItem(name: "key", value: apiKey),
        URLQueryItem(name: "maxWidthPx", value: "\(maxWidth)")
    ]
    return components?.url
}

struct PlannedTripCardView: View {
    let trip: PlannedTrip

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Try Google photo from any place in itinerary first
            if let photoRef = trip.allPlaces.compactMap({ $0.photoReferences?.first }).first,
               let url = googlePlacePhotoURL(photoReference: photoRef, maxWidth: 400) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image
                            .resizable()
                            .scaledToFill()
                            .frame(height: 80)
                            .frame(maxWidth: .infinity)
                            .clipped()
                            .cornerRadius(10)
                    } else if phase.error != nil {
                        Color.gray.opacity(0.1)
                            .frame(height: 80)
                            .frame(maxWidth: .infinity)
                            .cornerRadius(10)
                            .overlay(Image(systemName: "photo"))
                    } else {
                        Color.gray.opacity(0.1)
                            .frame(height: 80)
                            .frame(maxWidth: .infinity)
                            .cornerRadius(10)
                            .overlay(ProgressView())
                    }
                }
            }
            // Next fallback: user-provided image data
            else if let data = trip.photoData, let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 80)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .cornerRadius(10)
            }
            // Last fallback: placeholder
            else {
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
