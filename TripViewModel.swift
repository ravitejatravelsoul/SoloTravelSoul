import Foundation
import MapKit

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
            Place(
                id: "1",
                name: "Louvre Museum",
                address: "Paris, France",
                latitude: 48.8606,
                longitude: 2.3376,
                types: ["museum"],
                rating: 4.7,
                userRatingsTotal: 100000,
                photoReferences: nil,    // <- Updated: plural and array or nil
                reviews: nil,
                openingHours: nil,
                phoneNumber: nil,
                website: nil
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
                website: nil
            )
        ]
    }

    func addTrip(_ trip: PlannedTrip) {
        // Prevent duplicate trips with same id
        guard !trips.contains(where: { $0.id == trip.id }) else { return }
        trips.append(trip)
    }

    func addPlaceToTrip(tripId: UUID, date: Date, place: Place) {
        guard let tripIdx = trips.firstIndex(where: { $0.id == tripId }) else { return }
        var trip = trips[tripIdx]
        if let dayIdx = trip.itinerary.firstIndex(where: { Calendar.current.isDate($0.date, inSameDayAs: date) }) {
            trip.itinerary[dayIdx].places.append(place)
        } else {
            let newDay = ItineraryDay(date: date, places: [place])
            trip.itinerary.append(newDay)
        }
        trips[tripIdx] = trip
    }

    func deleteTrip(withId id: UUID) {
        trips.removeAll { $0.id == id }
    }

    func updateTrip(_ updatedTrip: PlannedTrip) {
        if let idx = trips.firstIndex(where: { $0.id == updatedTrip.id }) {
            trips[idx] = updatedTrip
        }
    }

    func optimizeTripItinerary(tripId: UUID) {
        guard let tripIdx = trips.firstIndex(where: { $0.id == tripId }) else { return }
        var trip = trips[tripIdx]
        let optimized = ItineraryOptimizer.optimizeRoute(places: trip.allPlaces)
        trip.setOptimizedPlaces(optimized)
        trips[tripIdx] = trip
    }

    func optimizeDayInTrip(tripId: UUID, dayId: UUID) {
        guard let tripIdx = trips.firstIndex(where: { $0.id == tripId }) else { return }
        var trip = trips[tripIdx]
        guard let dayIdx = trip.itinerary.firstIndex(where: { $0.id == dayId }) else { return }
        let places = trip.itinerary[dayIdx].places
        let optimized = ItineraryOptimizer.optimizeRoute(places: places)
        trip.itinerary[dayIdx].places = optimized
        trips[tripIdx] = trip
    }

    // MARK: - Map Helpers
    func coordinatesForTrip(_ trip: PlannedTrip) -> [CLLocationCoordinate2D] {
        trip.allPlaces.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }
    }
    func coordinatesForDay(_ day: ItineraryDay) -> [CLLocationCoordinate2D] {
        day.places.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }
    }
}
