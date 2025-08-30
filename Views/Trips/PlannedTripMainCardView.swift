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

struct PlannedTripMainCardView: View {
    let trip: PlannedTrip
    var onView: (() -> Void)?
    var onEdit: (() -> Void)?
    var onDelete: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            tripImage
            Text(trip.destination.isEmpty ? "No Destination" : trip.destination)
                .font(.title2.bold())
                .foregroundColor(.primary)
                .lineLimit(1)
            Text(dateRangeText)
                .font(.subheadline)
                .foregroundColor(.secondary)
            if trip.endDate < Date() {
                Text("Trip completed!")
                    .font(.caption)
                    .foregroundColor(.green)
            }
            if let place = trip.placeName, !place.isEmpty {
                Text(place)
                    .font(.callout)
                    .foregroundColor(.secondary)
            }
            if !trip.notes.isEmpty {
                Text(trip.notes)
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
            HStack(spacing: 12) {
                Button(action: { onView?() }) {
                    Text("View Details")
                        .font(.subheadline.bold())
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                }
                Button(action: { onEdit?() }) {
                    Text("Edit Trip")
                        .font(.subheadline)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 6)
                        .background(Color(.systemGray5))
                        .foregroundColor(Color.blue)
                        .cornerRadius(8)
                }
                Spacer()
                Button(action: { onDelete?() }) {
                    Image(systemName: "trash")
                        .font(.body)
                        .foregroundColor(.red)
                }
            }
            .padding(.top, 4)
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(18)
        .shadow(color: Color.black.opacity(0.08), radius: 4, x: 2, y: 2)
        .frame(width: 300, alignment: .leading)
    }

    var tripImage: some View {
        Group {
            if let photoRef = trip.allPlaces.compactMap({ $0.photoReferences?.first }).first,
               let url = googlePlacePhotoURL(photoReference: photoRef, maxWidth: 400) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable()
                    } else if phase.error != nil {
                        Color.gray.opacity(0.1)
                            .overlay(Image(systemName: "photo"))
                    } else {
                        Color.gray.opacity(0.1)
                            .overlay(ProgressView())
                    }
                }
            }
            else if let data = trip.photoData, let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
            } else {
                Color.gray.opacity(0.1)
                    .overlay(Image(systemName: "photo").font(.title))
            }
        }
        .scaledToFill()
        .frame(height: 120)
        .cornerRadius(14)
        .clipped()
    }

    var dateRangeText: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return "\(formatter.string(from: trip.startDate)) – \(formatter.string(from: trip.endDate))"
    }
}
