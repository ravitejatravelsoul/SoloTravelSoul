import Foundation
import Combine

class PlaceSearchViewModel: ObservableObject {
    @Published var searchText: String = ""
    @Published var results: [Place] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var showAddToItinerarySheet: Bool = false
    @Published var selectedPlace: Place? = nil

    // Activity filter and filtered results
    @Published var filterActivity: String? = nil
    @Published var filteredResults: [Place] = []

    var trips: [PlannedTrip] {
        tripViewModel.trips
    }

    private var cancellables = Set<AnyCancellable>()
    private var tripViewModel: TripViewModel

    // NEW: Stores food spots (restaurants/local food)
    @Published var foodResults: [Place] = []

    // NEW: Dynamic activity types from current results
    var availableActivities: [String] {
        let allTypes = results.compactMap { $0.types }.flatMap { $0 }
        let uniqueTypes = Set(allTypes.map { $0.capitalized })
        let mappedTypes = uniqueTypes.map { type -> String in
            // Simple mapping for better display, expand as needed
            switch type.lowercased() {
            case "museum": return "Museum"
            case "park": return "Park"
            case "restaurant": return "Food"
            case "shopping_mall", "store": return "Shopping"
            case "natural_feature": return "Nature"
            default: return type.replacingOccurrences(of: "_", with: " ")
            }
        }
        let activities = Array(Set(mappedTypes)).sorted()
        return ["All"] + activities
    }

    init(tripViewModel: TripViewModel) {
        self.tripViewModel = tripViewModel

        // Search text debounce
        $searchText
            .debounce(for: .milliseconds(350), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { [weak self] text in
                Task { await self?.searchPlaces(query: text) }
            }
            .store(in: &cancellables)

        // Update filtered results when results or filterActivity change
        Publishers.CombineLatest($results, $filterActivity)
            .map { places, activity in
                guard let activity = activity, !activity.isEmpty, activity != "All" else { return places }
                // Filter by place types (case-insensitive)
                return places.filter { place in
                    guard let types = place.types else { return false }
                    return types.contains(where: { $0.localizedCaseInsensitiveContains(activity) })
                }
            }
            .assign(to: &$filteredResults)
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
            let places = try await GooglePlacesService.shared.fetchTopPlaces(for: location)
            self.results = Array(places.prefix(15))
        } catch {
            errorMessage = error.localizedDescription
            results = []
        }
        isLoading = false
    }

    // MARK: - NEW: Fetch food spots (restaurants/local food)
    /// Fetches local food/restaurant places for the given location using Google Places API.
    /// You can further refine the keyword if you want to focus on special local foods.
    @MainActor
    func fetchFoodPlaces(for location: String) async -> [Place] {
        guard !location.trimmingCharacters(in: .whitespaces).isEmpty else {
            foodResults = []
            return []
        }
        isLoading = true
        defer { isLoading = false }
        do {
            // Using 'restaurant' type and 'local food' as keyword to fetch local cuisine spots.
            let places = try await GooglePlacesService.shared.searchPlaces(
                query: "\(location) local food",
                type: "restaurant"
            )
            let resultsLimited = Array(places.prefix(10))
            self.foodResults = resultsLimited
            return resultsLimited
        } catch {
            errorMessage = error.localizedDescription
            foodResults = []
            return []
        }
    }

    func fetchPlaceDetails(placeID: String, completion: @escaping (Place?, String?) -> Void) {
        Task {
            do {
                let place = try await GooglePlacesService.shared.fetchPlaceDetails(placeID: placeID)
                completion(place, nil)
            } catch {
                completion(nil, error.localizedDescription)
            }
        }
    }

    // Updated: match TripViewModel API (trip: PlannedTrip, not id)
    func addPlaceToTrip(trip: PlannedTrip, date: Date, place: Place) {
        tripViewModel.addPlaceToTrip(place: place, to: trip)
    }

    func createTripAndAddPlace(name: String, notes: String, date: Date, place: Place) {
        let newTrip = PlannedTrip(
            id: UUID(),
            destination: name,
            startDate: date,
            endDate: date,
            notes: notes,
            itinerary: [ItineraryDay(date: date, places: [place])],
            photoData: nil,
            latitude: place.latitude,
            longitude: place.longitude,
            placeName: place.name,
            members: []
        )
        tripViewModel.addTrip(newTrip)
    }

    // Apply the activity filter (called from UI)
    func applyActivityFilter() {
        // Triggers Combine pipeline with new filterActivity
        self.filterActivity = self.filterActivity // Force update for UI call
    }
}
