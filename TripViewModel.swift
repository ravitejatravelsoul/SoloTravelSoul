import Foundation
import Combine
import FirebaseAuth

class TripViewModel: ObservableObject {
    @Published var trips: [PlannedTrip] = []
    @Published var errorMessage: String?
    @Published var isLoading: Bool = false

    private var userId: String? { Auth.auth().currentUser?.uid }

    // MARK: - Init
    init() {
        // For UI testing, keep trips empty so suggestions show
        self.trips = []
    }

    // MARK: - Computed properties for filtering trips

    var currentUserId: String? {
        Auth.auth().currentUser?.uid
    }
    var today: Date {
        Calendar.current.startOfDay(for: Date())
    }
    var myTrips: [PlannedTrip] {
        guard let uid = currentUserId else { return [] }
        return trips.filter { $0.members.contains(uid) }
    }
    var upcomingTrips: [PlannedTrip] {
        myTrips.filter { $0.startDate >= today }.sorted { $0.startDate < $1.startDate }
    }
    var pastTrips: [PlannedTrip] {
        myTrips.filter { $0.endDate < today }.sorted { $0.startDate > $1.startDate }
    }

    // MARK: - Firebase Trip Operations

    func loadTrips() {
        guard let uid = userId else { self.trips = []; return }
        print("TripViewModel: Loading trips for user \(uid)")
        isLoading = true
        FirestoreService.shared.fetchTrips(forUser: uid) { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success(let trips):
                    print("TripViewModel: Loaded \(trips.count) trips")
                    self?.trips = trips

                    // Debug: Print loaded trips meta
                    for trip in trips {
                        print("Trip \(trip.destination): members = \(trip.members), startDate = \(trip.startDate), endDate = \(trip.endDate)")
                    }
                    // Debug: Print filtering results
                    let uid = self?.currentUserId ?? "nil"
                    let myTrips = trips.filter { $0.members.contains(uid) }
                    let today = Calendar.current.startOfDay(for: Date())
                    let upcoming = myTrips.filter { $0.startDate >= today }
                    let past = myTrips.filter { $0.endDate < today }
                    print("CurrentUserId: \(uid)")
                    print("myTrips: \(myTrips.count), upcoming: \(upcoming.count), past: \(past.count)")

                case .failure(let error):
                    print("TripViewModel: Failed to load trips: \(error)")
                    self?.errorMessage = error.localizedDescription
                }
            }
        }
    }

    // Updated: Ensure user is added to members array when creating/updating trip
    func addOrUpdateTrip(_ trip: PlannedTrip) {
        guard let uid = userId else { return }
        var updatedTrip = trip
        if !updatedTrip.members.contains(uid) {
            updatedTrip.members.append(uid)
        }
        FirestoreService.shared.addOrUpdateTrip(updatedTrip, forUser: uid) { [weak self] error in
            DispatchQueue.main.async {
                if let error = error {
                    self?.errorMessage = error.localizedDescription
                }
                self?.loadTrips()
            }
        }
    }

    func addTrip(_ trip: PlannedTrip) { addOrUpdateTrip(trip) }
    func updateTrip(_ trip: PlannedTrip) { addOrUpdateTrip(trip) }

    func deleteTrip(_ trip: PlannedTrip) {
        guard let uid = userId else { return }
        FirestoreService.shared.deleteTrip(trip.id, forUser: uid) { [weak self] error in
            DispatchQueue.main.async {
                if let error = error {
                    self?.errorMessage = error.localizedDescription
                }
                self?.loadTrips()
            }
        }
    }

    // MARK: - Places

    /// Adds a place to the last day of the trip's itinerary,
    /// or creates a new day if itinerary is empty.
    /// If the place already has a category, it is kept. Otherwise, assign by type.
    func addPlaceToTrip(place: Place, to trip: PlannedTrip) {
        var updated = trip
        var placeToAdd = place
        // Assign category if not already present
        if placeToAdd.category == nil {
            if let types = placeToAdd.types, types.contains(where: { $0.lowercased().contains("restaurant") }) {
                placeToAdd.category = "food"
            } else {
                placeToAdd.category = "attraction"
            }
        }
        if updated.itinerary.isEmpty {
            updated.itinerary.append(ItineraryDay(date: Date(), places: [placeToAdd]))
        } else {
            updated.itinerary[updated.itinerary.count - 1].places.append(placeToAdd)
        }
        addOrUpdateTrip(updated)
    }

    // MARK: - Journal Entry Mutations

    func deleteJournalEntryFromDay(tripId: UUID, dayId: UUID, entryId: UUID) {
        guard let tripIndex = trips.firstIndex(where: { $0.id == tripId }),
              let dayIndex = trips[tripIndex].itinerary.firstIndex(where: { $0.id == dayId }) else { return }
        trips[tripIndex].itinerary[dayIndex].journalEntries.removeAll { $0.id == entryId }
        addOrUpdateTrip(trips[tripIndex])
    }

    func addJournalEntryToDay(_ entry: JournalEntry, tripId: UUID, dayId: UUID) {
        guard let tripIndex = trips.firstIndex(where: { $0.id == tripId }),
              let dayIndex = trips[tripIndex].itinerary.firstIndex(where: { $0.id == dayId }) else { return }
        trips[tripIndex].itinerary[dayIndex].journalEntries.append(entry)
        addOrUpdateTrip(trips[tripIndex])
    }

    func updateJournalEntryInDay(_ entry: JournalEntry, tripId: UUID, dayId: UUID) {
        guard let tripIndex = trips.firstIndex(where: { $0.id == tripId }),
              let dayIndex = trips[tripIndex].itinerary.firstIndex(where: { $0.id == dayId }),
              let entryIndex = trips[tripIndex].itinerary[dayIndex].journalEntries.firstIndex(where: { $0.id == entry.id })
        else { return }
        trips[tripIndex].itinerary[dayIndex].journalEntries[entryIndex] = entry
        addOrUpdateTrip(trips[tripIndex])
    }
}
