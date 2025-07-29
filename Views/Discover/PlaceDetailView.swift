import SwiftUI
import MapKit

fileprivate func googlePlacePhotoURL(photoReference: String, maxWidth: Int = 400) -> URL? {
    let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU" // use your key or a constant here
    let urlString = "https://maps.googleapis.com/maps/api/place/photo?maxwidth=\(maxWidth)&photoreference=\(photoReference)&key=\(apiKey)"
    return URL(string: urlString)
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
                if let photos = place.photoReferences, !photos.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(photos, id: \.self) { ref in
                                AsyncImage(url: googlePlacePhotoURL(photoReference: ref, maxWidth: 400)) { image in
                                    image.resizable().aspectRatio(contentMode: .fill)
                                } placeholder: {
                                    Color.gray.opacity(0.2)
                                }
                                .frame(width: 200, height: 140)
                                .cornerRadius(12)
                            }
                        }
                    }
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

                // Updated for iOS 17+ Map API
                Map(initialPosition: .region(region)) {
                    Marker(place.name, coordinate: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude))
                }
                .frame(height: 180)
                .cornerRadius(12)

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
