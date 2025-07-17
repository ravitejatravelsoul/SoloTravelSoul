import SwiftUI
import CoreLocation

struct DiscoverView: View {
    @State private var attractions: [Attraction] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil

    var body: some View {
        NavigationView {
            VStack {
                if isLoading {
                    ProgressView("Loading Attractions...")
                        .padding()
                }
                if let errorMessage = errorMessage {
                    Text(errorMessage)
                        .foregroundColor(.red)
                        .padding()
                }
                List(attractions) { attraction in
                    AttractionCardView(attraction: attraction)
#if canImport(UIKit)
                    .listRowSeparator(.hidden)
#endif
                }
                .listStyle(PlainListStyle())
            }
            .navigationTitle("Discover")
            .onAppear {
                loadAttractions()
            }
        }
    }

    func loadAttractions() {
        isLoading = true
        errorMessage = nil
        // Example: search for "museum" near a coordinate (make this dynamic as you wish)
        let sampleLocation = CLLocationCoordinate2D(latitude: 40.7128, longitude: -74.0060) // New York City
        PlacesService.shared.fetchAttractions(keyword: "museum", location: sampleLocation, pageSize: 10) { fetchedAttractions, error in
            DispatchQueue.main.async {
                isLoading = false
                if let error = error {
                    errorMessage = error.localizedDescription
                } else if let fetchedAttractions = fetchedAttractions {
                    attractions = fetchedAttractions
                }
            }
        }
    }
}
