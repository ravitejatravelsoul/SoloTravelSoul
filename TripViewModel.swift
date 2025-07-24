import Foundation

class TripViewModel: ObservableObject {
    @Published var trips: [PlannedTrip] = [
        PlannedTrip(
            id: UUID(),
            destination: "Paris",
            startDate: Date(),
            endDate: Calendar.current.date(byAdding: .day, value: 4, to: Date())!,
            notes: "Sample Paris trip",
            itinerary: []
        ),
        PlannedTrip(
            id: UUID(),
            destination: "London",
            startDate: Date(),
            endDate: Calendar.current.date(byAdding: .day, value: 7, to: Date())!,
            notes: "Sample London trip",
            itinerary: []
        )
    ]
    @Published var discoveredPlaces: [Place] = []
    @Published var selectedPlace: Place? = nil
    @Published var showAddToItinerarySheet: Bool = false

    func searchPlaces(keyword: String) {
        // Replace with your real API logic!
        discoveredPlaces = [
            Place(id: "1", name: "Louvre Museum", address: "Paris, France", latitude: 48.8606, longitude: 2.3376, types: ["museum"], rating: 4.7, userRatingsTotal: 100000, photoReference: nil),
            Place(id: "2", name: "Eiffel Tower", address: "Paris, France", latitude: 48.8584, longitude: 2.2945, types: ["tourist_attraction"], rating: 4.6, userRatingsTotal: 85000, photoReference: nil)
        ]
    }

    func addTrip(_ trip: PlannedTrip) {
        trips.append(trip)
    }

    func addPlaceToTrip(tripId: UUID, date: Date, place: Place) {
        let itineraryPlace = ItineraryPlace(
            id: place.id,
            name: place.name,
            address: place.address,
            latitude: place.latitude,
            longitude: place.longitude,
            types: place.types,
            rating: place.rating,
            userRatingsTotal: place.userRatingsTotal,
            photoReference: place.photoReference
        )
        guard let tripIdx = trips.firstIndex(where: { $0.id == tripId }) else { return }
        var trip = trips[tripIdx]
        if let dayIdx = trip.itinerary.firstIndex(where: { Calendar.current.isDate($0.date, inSameDayAs: date) }) {
            trip.itinerary[dayIdx].places.append(itineraryPlace)
        } else {
            let newDay = ItineraryDay(date: date, places: [itineraryPlace])
            trip.itinerary.append(newDay)
        }
        trips[tripIdx] = trip
    }
}
extension TripViewModel {
    func deleteTrip(withId id: UUID) {
        trips.removeAll { $0.id == id }
    }

    func updateTrip(_ updatedTrip: PlannedTrip) {
        if let idx = trips.firstIndex(where: { $0.id == updatedTrip.id }) {
            trips[idx] = updatedTrip
        }
    }
}
