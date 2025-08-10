import SwiftUI
import MapKit

fileprivate func googlePlacePhotoURL(photoReference: String, maxWidth: Int = 400) -> URL? {
    let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU"
    var components = URLComponents(string: "https://places.googleapis.com/v1/\(photoReference)/media")
    components?.queryItems = [
        URLQueryItem(name: "key", value: apiKey),
        URLQueryItem(name: "maxWidthPx", value: "\(maxWidth)")
    ]
    return components?.url
}

struct PlaceDetailView: View {
    let place: Place
    @State private var region: MKCoordinateRegion

    init(place: Place) {
        self.place = place
        self._region = State(initialValue: MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude),
            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
        ))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                // --- Fix: Use .background and .clipped for proper image display & fallback ---
                if let photos = place.photoReferences, !photos.isEmpty {
                    TabView {
                        ForEach(photos, id: \.self) { ref in
                            if let url = googlePlacePhotoURL(photoReference: ref, maxWidth: 600) {
                                AsyncImage(url: url) { phase in
                                    if let image = phase.image {
                                        image
                                            .resizable()
                                            .aspectRatio(contentMode: .fill)
                                            .frame(width: UIScreen.main.bounds.width - 40, height: 220)
                                            .clipped()
                                    } else if phase.error != nil {
                                        Color.gray.opacity(0.2)
                                            .overlay(Image(systemName: "exclamationmark.triangle").foregroundColor(.red))
                                            .frame(width: UIScreen.main.bounds.width - 40, height: 220)
                                    } else {
                                        ZStack {
                                            Color.gray.opacity(0.2)
                                            ProgressView()
                                        }
                                        .frame(width: UIScreen.main.bounds.width - 40, height: 220)
                                    }
                                }
                                .cornerRadius(14)
                                .padding(.vertical, 4)
                            }
                        }
                    }
                    .tabViewStyle(PageTabViewStyle())
                    .frame(height: 230)
                } else {
                    Color.gray.opacity(0.15)
                        .frame(height: 220)
                        .cornerRadius(14)
                        .overlay(Image(systemName: "photo").font(.largeTitle).foregroundColor(.gray))
                }

                Text(place.name).font(.title2).bold()
                if let address = place.address {
                    Text(address).font(.callout)
                }
                if let open = place.openingHours?.open_now {
                    Text(open ? "Open now" : "Closed")
                        .font(.caption)
                        .foregroundColor(open ? .green : .red)
                }
                if let hours = place.openingHours?.weekday_text {
                    ForEach(hours, id: \.self) { line in
                        Text(line).font(.caption2).foregroundColor(.secondary)
                    }
                }

                Map(initialPosition: .region(region)) {
                    Marker(place.name, coordinate: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude))
                }
                .frame(height: 180)
                .cornerRadius(12, corners: [.topLeft, .topRight])

                if let phone = place.phoneNumber {
                    HStack { Image(systemName: "phone"); Text(phone) }
                        .foregroundColor(.blue)
                        .font(.callout)
                }
                if let website = place.website, let url = URL(string: website) {
                    Link(destination: url) {
                        HStack { Image(systemName: "globe"); Text(website) }
                            .font(.callout)
                    }
                }

                if let reviews = place.reviews, !reviews.isEmpty {
                    Text("Reviews").font(.headline)
                    ForEach(reviews.prefix(3), id: \.self) { review in
                        VStack(alignment: .leading) {
                            if let author = review.author_name {
                                Text(author).font(.subheadline).bold()
                            }
                            if let text = review.text {
                                Text("\"\(text)\"")
                                    .foregroundColor(.secondary)
                            }
                            if let desc = review.relative_time_description {
                                Text(desc).font(.caption2).foregroundColor(.gray)
                            }
                            Divider()
                        }
                    }
                }
            }
            .padding()
        }
    }
}
