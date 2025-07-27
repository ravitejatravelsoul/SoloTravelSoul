import Foundation
import Combine
import CoreLocation

class PlaceSearchViewModel: ObservableObject {
    @Published var searchText: String = ""
    @Published var results: [Place] = [] // Uses your unified Place model
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var showAddToItinerarySheet: Bool = false
    @Published var selectedPlace: Place? = nil

    private var cancellables = Set<AnyCancellable>()
    private var tripViewModel: TripViewModel

    init(tripViewModel: TripViewModel) {
        self.tripViewModel = tripViewModel

        $searchText
            .debounce(for: .milliseconds(350), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { [weak self] text in
                Task { await self?.searchPlaces(query: text) }
            }
            .store(in: &cancellables)
    }

    func setTripViewModel(_ vm: TripViewModel) {
        self.tripViewModel = vm
    }

    @MainActor
    func searchPlaces(query: String) async {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
            results = []
            errorMessage = nil
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            let places = try await GooglePlacesService.shared.searchPlaces(query: query)
            results = places
        } catch {
            errorMessage = error.localizedDescription
            results = []
        }
        isLoading = false
    }

    /// Fetch top places for a city or country (returns top 15 results)
    @MainActor
    func fetchTopPlaces(for location: String) async {
        guard !location.trimmingCharacters(in: .whitespaces).isEmpty else {
            results = []
            errorMessage = nil
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            // Use smart query for Google Places (no geocode/location bias!)
            let places = try await GooglePlacesService.shared.fetchTopPlaces(for: location)
            self.results = Array(places.prefix(15))
        } catch {
            errorMessage = error.localizedDescription
            results = []
        }
        isLoading = false
    }
}
