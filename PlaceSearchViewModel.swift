import Foundation
import Combine

class PlaceSearchViewModel: ObservableObject {
    @Published var searchText: String = ""
    @Published var results: [Place] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var showAddToItinerarySheet: Bool = false
    @Published var selectedPlace: Place? = nil

    var trips: [PlannedTrip] {
        tripViewModel.trips
    }

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

    func addPlaceToTrip(tripId: UUID, date: Date, place: Place) {
        tripViewModel.addPlaceToTrip(tripId: tripId, date: date, place: place)
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
            members: [] // <-- Added members argument
        )
        tripViewModel.addTrip(newTrip)
    }
}
