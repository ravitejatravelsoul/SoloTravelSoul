import SwiftUI
import MapKit

struct PlaceDetailView: View {
    let place: Place
    let onAddToItinerary: () -> Void

    @State private var region: MKCoordinateRegion

    init(place: Place, onAddToItinerary: @escaping () -> Void) {
        self.place = place
        self.onAddToItinerary = onAddToItinerary
        _region = State(initialValue: MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude),
            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
        ))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(place.name)
                    .font(.largeTitle)
                    .bold()
                if let address = place.address {
                    Text(address)
                        .font(.title2)
                        .foregroundColor(.secondary)
                }
                if let rating = place.rating {
                    Text("Rating: \(String(format: "%.1f", rating))")
                        .font(.headline)
                }
                if let types = place.types {
                    Text("Types: \(types.joined(separator: ", "))")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                }
                Map(coordinateRegion: $region, annotationItems: [place]) { place in
                    MapMarker(coordinate: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude), tint: .accentColor)
                }
                .frame(height: 200)
                .cornerRadius(10)

                Button(action: onAddToItinerary) {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                        Text("Add to Itinerary")
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
                .padding(.top)
            }
            .padding()
        }
        .navigationTitle("Place Details")
        .navigationBarTitleDisplayMode(.inline)
    }
}
