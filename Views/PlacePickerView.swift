import SwiftUI
import MapKit

struct PlacePickerView: View {
    @ObservedObject var searchViewModel: PlaceSearchViewModel
    @Environment(\.presentationMode) var presentationMode

    var onPick: (Place) -> Void

    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 20, longitude: 80),
        span: MKCoordinateSpan(latitudeDelta: 0.5, longitudeDelta: 0.5)
    )

    var body: some View {
        VStack(spacing: 8) {
            TextField("Search for a place...", text: $searchViewModel.searchText)
                .padding(8)
                .background(Color(.systemGray6))
                .cornerRadius(8)

            if searchViewModel.isLoading {
                ProgressView("Searching...")
            }

            if let error = searchViewModel.errorMessage {
                Text(error)
                    .foregroundColor(.red)
            }

            if !searchViewModel.results.isEmpty {
                List(searchViewModel.results) { place in
                    Button {
                        searchViewModel.selectedPlace = place
                        region.center = CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude)
                    } label: {
                        VStack(alignment: .leading) {
                            Text(place.name)
                            if let address = place.address {
                                Text(address)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }
                .frame(maxHeight: 200)
            }

            Map(initialPosition: .region(region)) {
                if let place = searchViewModel.selectedPlace {
                    Marker(place.name, coordinate: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude))
                }
            }
            .frame(height: 200)

            if let place = searchViewModel.selectedPlace {
                Button("Add to Itinerary") {
                    onPick(place)
                    // Optional: reset picker state
                    searchViewModel.searchText = ""
                    searchViewModel.results = []
                    searchViewModel.selectedPlace = nil
                    presentationMode.wrappedValue.dismiss()
                }
                .padding()
                .buttonStyle(.borderedProminent)
            }
        }
        .padding()
    }
}
