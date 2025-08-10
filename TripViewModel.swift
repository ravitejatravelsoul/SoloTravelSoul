import Foundation
import MapKit

private let tripsKey = "SoloTravelSoul_Trips"

class TripViewModel: ObservableObject {
    @Published var trips: [PlannedTrip] = [] {
        didSet { saveTrips() }
    }
    @Published var discoveredPlaces: [Place] = []
    @Published var selectedPlace: Place? = nil
    @Published var showAddToItinerarySheet: Bool = false

    init() {
        loadTrips()
        if trips.isEmpty {
            trips = PlannedTrip.samplePlannedTrips()
        }
    }

    // MARK: - Persistence
    private func saveTrips() {
        do {
            let encoder = JSONEncoder()
            let data = try encoder.encode(trips)
            UserDefaults.standard.set(data, forKey: tripsKey)
        } catch {
            print("Failed to save trips: \(error)")
        }
    }

    private func loadTrips() {
        guard let data = UserDefaults.standard.data(forKey: tripsKey) else { return }
        do {
            let decoder = JSONDecoder()
            let loaded = try decoder.decode([PlannedTrip].self, from: data)
            self.trips = loaded
        } catch {
            print("Failed to load trips: \(error)")
        }
    }

    // MARK: - Place Search (stub)
    func searchPlaces(keyword: String) {
        discoveredPlaces = [
            Place(
                id: "1",
                name: "Louvre Museum",
                address: "Paris, France",
                latitude: 48.8606,
                longitude: 2.3376,
                types: ["museum"],
                rating: 4.7,
                userRatingsTotal: 100000,
                photoReferences: nil,
                reviews: nil,
                openingHours: nil,
                phoneNumber: nil,
                website: nil,
                journalEntries: nil
            ),
            Place(
                id: "2",
                name: "Eiffel Tower",
                address: "Paris, France",
                latitude: 48.8584,
                longitude: 2.2945,
                types: ["tourist_attraction"],
                rating: 4.6,
                userRatingsTotal: 85000,
                photoReferences: nil,
                reviews: nil,
                openingHours: nil,
                phoneNumber: nil,
                website: nil,
                journalEntries: nil
            )
        ]
    }

    // MARK: - Trip CRUD
    func addTrip(_ trip: PlannedTrip) {
        guard !trips.contains(where: { $0.id == trip.id }) else { return }
        trips.append(trip)
    }

    func updateTrip(_ updatedTrip: PlannedTrip) {
        if let idx = trips.firstIndex(where: { $0.id == updatedTrip.id }) {
            trips[idx] = updatedTrip
        }
    }

    func deleteTrip(withId id: UUID) {
        trips.removeAll { $0.id == id }
    }

    // MARK: - Itinerary
    func addPlaceToTrip(tripId: UUID, date: Date, place: Place) {
        guard let tripIdx = trips.firstIndex(where: { $0.id == tripId }) else { return }
        var trip = trips[tripIdx]
        if let dayIdx = trip.itinerary.firstIndex(where: { Calendar.current.isDate($0.date, inSameDayAs: date) }) {
            trip.itinerary[dayIdx].places.append(place)
        } else {
            let newDay = ItineraryDay(date: date, places: [place], journalEntries: [])
            trip.itinerary.append(newDay)
        }
        trips[tripIdx] = trip
    }

    // MARK: - Per-Day Journal Entry
    func addJournalEntryToDay(_ entry: JournalEntry, tripId: UUID, dayId: UUID) {
        guard let tripIdx = trips.firstIndex(where: { $0.id == tripId }) else { return }
        guard let dayIdx = trips[tripIdx].itinerary.firstIndex(where: { $0.id == dayId }) else { return }
        trips[tripIdx].itinerary[dayIdx].journalEntries.append(entry)
    }

    func updateJournalEntryInDay(_ entry: JournalEntry, tripId: UUID, dayId: UUID) {
        guard let tripIdx = trips.firstIndex(where: { $0.id == tripId }) else { return }
        guard let dayIdx = trips[tripIdx].itinerary.firstIndex(where: { $0.id == dayId }) else { return }
        guard let entryIdx = trips[tripIdx].itinerary[dayIdx].journalEntries.firstIndex(where: { $0.id == entry.id }) else { return }
        trips[tripIdx].itinerary[dayIdx].journalEntries[entryIdx] = entry
    }

    func deleteJournalEntryFromDay(tripId: UUID, dayId: UUID, entryId: UUID) {
        guard let tripIdx = trips.firstIndex(where: { $0.id == tripId }) else { return }
        guard let dayIdx = trips[tripIdx].itinerary.firstIndex(where: { $0.id == dayId }) else { return }
        trips[tripIdx].itinerary[dayIdx].journalEntries.removeAll { $0.id == entryId }
    }

    // MARK: - Per-Place Journal Entry
    func addJournalEntryToPlace(_ entry: JournalEntry, tripId: UUID, dayId: UUID, placeId: String) {
        guard let tripIdx = trips.firstIndex(where: { $0.id == tripId }) else { return }
        guard let dayIdx = trips[tripIdx].itinerary.firstIndex(where: { $0.id == dayId }) else { return }
        guard let placeIdx = trips[tripIdx].itinerary[dayIdx].places.firstIndex(where: { $0.id == placeId }) else { return }
        if trips[tripIdx].itinerary[dayIdx].places[placeIdx].journalEntries == nil {
            trips[tripIdx].itinerary[dayIdx].places[placeIdx].journalEntries = []
        }
        trips[tripIdx].itinerary[dayIdx].places[placeIdx].journalEntries?.append(entry)
    }

    func updateJournalEntryInPlace(_ entry: JournalEntry, tripId: UUID, dayId: UUID, placeId: String) {
        guard let tripIdx = trips.firstIndex(where: { $0.id == tripId }) else { return }
        guard let dayIdx = trips[tripIdx].itinerary.firstIndex(where: { $0.id == dayId }) else { return }
        guard let placeIdx = trips[tripIdx].itinerary[dayIdx].places.firstIndex(where: { $0.id == placeId }) else { return }
        guard let entryIdx = trips[tripIdx].itinerary[dayIdx].places[placeIdx].journalEntries?.firstIndex(where: { $0.id == entry.id }) else { return }
        trips[tripIdx].itinerary[dayIdx].places[placeIdx].journalEntries?[entryIdx] = entry
    }

    func deleteJournalEntryFromPlace(tripId: UUID, dayId: UUID, placeId: String, entryId: UUID) {
        guard let tripIdx = trips.firstIndex(where: { $0.id == tripId }) else { return }
        guard let dayIdx = trips[tripIdx].itinerary.firstIndex(where: { $0.id == dayId }) else { return }
        guard let placeIdx = trips[tripIdx].itinerary[dayIdx].places.firstIndex(where: { $0.id == placeId }) else { return }
        trips[tripIdx].itinerary[dayIdx].places[placeIdx].journalEntries?.removeAll { $0.id == entryId }
    }

    // MARK: - Trip-wide journal aggregation (for view convenience)
    func allJournalEntriesForTrip(_ trip: PlannedTrip) -> [JournalEntry] {
        // Collect from days and places
        let dayEntries = trip.itinerary.flatMap { $0.journalEntries }
        let placeEntries = trip.itinerary.flatMap { $0.places.compactMap { $0.journalEntries }.flatMap { $0 } }
        return dayEntries + placeEntries
    }

    // MARK: - Map Helpers
    func coordinatesForTrip(_ trip: PlannedTrip) -> [CLLocationCoordinate2D] {
        trip.allPlaces.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }
    }
    func coordinatesForDay(_ day: ItineraryDay) -> [CLLocationCoordinate2D] {
        day.places.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }
    }
}
