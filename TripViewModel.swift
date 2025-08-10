import Foundation
import Combine
import FirebaseAuth

class TripViewModel: ObservableObject {
    @Published var trips: [PlannedTrip] = []
    @Published var errorMessage: String?
    @Published var isLoading: Bool = false

    private var userId: String? { Auth.auth().currentUser?.uid }

    func loadTrips() {
        guard let uid = userId else { self.trips = []; return }
        isLoading = true
        FirestoreService.shared.fetchTrips(forUser: uid) { [weak self] result in
            DispatchQueue.main.async {
                self?.isLoading = false
                switch result {
                case .success(let trips): self?.trips = trips
                case .failure(let error): self?.errorMessage = error.localizedDescription
                }
            }
        }
    }

    func addOrUpdateTrip(_ trip: PlannedTrip) {
        guard let uid = userId else { return }
        FirestoreService.shared.addOrUpdateTrip(trip, forUser: uid) { [weak self] error in
            DispatchQueue.main.async {
                if let error = error { self?.errorMessage = error.localizedDescription }
                self?.loadTrips()
            }
        }
    }

    func addTrip(_ trip: PlannedTrip) {
        addOrUpdateTrip(trip)
    }

    func updateTrip(_ trip: PlannedTrip) {
        addOrUpdateTrip(trip)
    }

    func deleteTrip(_ trip: PlannedTrip) {
        guard let uid = userId else { return }
        FirestoreService.shared.deleteTrip(trip.id, forUser: uid) { [weak self] error in
            DispatchQueue.main.async {
                if let error = error { self?.errorMessage = error.localizedDescription }
                self?.loadTrips()
            }
        }
    }

    /// Add a Place to the last ItineraryDay, or create a new day if empty.
    func addPlaceToTrip(place: Place, to trip: PlannedTrip) {
        var updatedTrip = trip
        if updatedTrip.itinerary.isEmpty {
            updatedTrip.itinerary.append(ItineraryDay(date: Date(), places: [place]))
        } else {
            updatedTrip.itinerary[updatedTrip.itinerary.count-1].places.append(place)
        }
        addOrUpdateTrip(updatedTrip)
    }
}
extension TripViewModel {
    func deleteJournalEntryFromDay(tripId: UUID, dayId: UUID, entryId: UUID) {
        guard let tripIndex = trips.firstIndex(where: { $0.id == tripId }),
              let dayIndex = trips[tripIndex].itinerary.firstIndex(where: { $0.id == dayId }) else { return }
        trips[tripIndex].itinerary[dayIndex].journalEntries.removeAll(where: { $0.id == entryId })
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
              let entryIndex = trips[tripIndex].itinerary[dayIndex].journalEntries.firstIndex(where: { $0.id == entry.id }) else { return }
        trips[tripIndex].itinerary[dayIndex].journalEntries[entryIndex] = entry
        addOrUpdateTrip(trips[tripIndex])
    }
}
