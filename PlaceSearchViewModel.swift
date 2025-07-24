import Foundation
import Combine

class PlaceSearchViewModel: ObservableObject {
    @Published var searchText: String = ""
    @Published var results: [Place] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    // For Add to Itinerary
    @Published var showAddToItinerarySheet: Bool = false
    @Published var selectedPlace: Place?

    private var cancellables = Set<AnyCancellable>()
    private var tripViewModel: TripViewModel

    var trips: [PlannedTrip] {
        tripViewModel.trips
    }

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
        guard !query.isEmpty else {
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
            itinerary: []
        )
        tripViewModel.addTrip(newTrip)
        tripViewModel.addPlaceToTrip(tripId: newTrip.id, date: date, place: place)
    }
}
