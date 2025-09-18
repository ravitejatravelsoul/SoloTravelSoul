import SwiftUI
import MapKit
import UIKit

// MARK: - Google Place Photo Helper
fileprivate func googlePlacePhotoURL(photoReference: String, maxWidth: Int = 400) -> URL? {
    let apiKey = "YOUR_API_KEY_HERE" // Replace with your API key
    var components = URLComponents(string: "https://places.googleapis.com/v1/\(photoReference)/media")
    components?.queryItems = [
        URLQueryItem(name: "key", value: apiKey),
        URLQueryItem(name: "maxWidthPx", value: "\(maxWidth)")
    ]
    return components?.url
}

// MARK: - Map Launcher (Google Maps → Apple Maps fallback)
struct MapLauncher {
    static func openInMaps(placeName: String, latitude: Double, longitude: Double) {
        let encodedName = placeName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""

        // Google Maps URL scheme
        if let googleMapsURL = URL(string: "comgooglemaps://?q=\(encodedName)&center=\(latitude),\(longitude)&zoom=15"),
           UIApplication.shared.canOpenURL(googleMapsURL) {
            UIApplication.shared.open(googleMapsURL)
            return
        }

        // Fallback → Apple Maps
        if let appleMapsURL = URL(string: "http://maps.apple.com/?q=\(encodedName)&ll=\(latitude),\(longitude)") {
            UIApplication.shared.open(appleMapsURL)
        }
    }
}

// MARK: - Place Detail View
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

                // Photos
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

                // Basic info
                Text(place.name).font(.title2).bold()
                if let address = place.address {
                    Text(address).font(.callout)
                }
                if let open = place.openingHours?.openNow {
                    Text(open ? "Open now" : "Closed")
                        .font(.caption)
                        .foregroundColor(open ? .green : .red)
                }
                if let hours = place.openingHours?.weekdayText {
                    ForEach(hours, id: \.self) { line in
                        Text(line).font(.caption2).foregroundColor(.secondary)
                    }
                }

                // Map
                Map(initialPosition: .region(region)) {
                    Marker(place.name, coordinate: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude))
                }
                .frame(height: 180)
                .cornerRadius(12, corners: [.topLeft, .topRight])

                // "Open in Maps" Button
                Button(action: {
                    MapLauncher.openInMaps(
                        placeName: place.name,
                        latitude: place.latitude,
                        longitude: place.longitude
                    )
                }) {
                    Label("Open in Maps", systemImage: "map")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue.opacity(0.1))
                        .cornerRadius(8)
                }
                .padding(.vertical, 4)

                // Contact info
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

                // Reviews
                if let reviews = place.reviews, !reviews.isEmpty {
                    Text("Reviews").font(.headline)
                    ForEach(reviews.prefix(3)) { review in
                        VStack(alignment: .leading) {
                            if let author = review.authorName {
                                Text(author).font(.subheadline).bold()
                            }
                            if let text = review.text {
                                Text("\"\(text)\"")
                                    .foregroundColor(.secondary)
                            }
                            if let desc = review.relativeTimeDescription {
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
