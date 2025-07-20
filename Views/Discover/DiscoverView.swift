import SwiftUI
import CoreLocation

struct DiscoverView: View {
    @State private var attractions: [Attraction] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil
    @State private var searchText: String = ""
    @State private var location: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: 40.7128, longitude: -74.0060) // Default: NYC

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
                .searchable(text: $searchText, prompt: "Search attractions (e.g. museum, park)")
                .onSubmit(of: .search) {
                    loadAttractions()
                }
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
        let keyword = searchText.isEmpty ? "museum" : searchText
        PlacesService.shared.fetchAttractions(keyword: keyword, location: location, pageSize: 10) { fetchedAttractions, error in
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
