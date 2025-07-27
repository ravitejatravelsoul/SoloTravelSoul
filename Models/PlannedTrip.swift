import Foundation

struct PlannedTrip: Identifiable, Codable, Hashable {
    let id: UUID
    var destination: String
    var startDate: Date
    var endDate: Date
    var notes: String
    var itinerary: [ItineraryDay]
    var photoData: Data?
    var latitude: Double?
    var longitude: Double?
    var placeName: String?
    var isPlanned: Bool { true }

    // Returns all places across all days for optimization
    var allPlaces: [Place] {
        itinerary.flatMap { $0.places }
    }

    // Replace all places in the itinerary with new optimized order, distributing by day
    mutating func setOptimizedPlaces(_ places: [Place]) {
        guard !itinerary.isEmpty else { return }
        let days = itinerary.count
        let perDay = max(1, places.count / days)
        var placesCopy = places
        for i in 0..<days {
            let slice = Array(placesCopy.prefix(perDay))
            itinerary[i].places = slice
            placesCopy = Array(placesCopy.dropFirst(perDay))
        }
        if !placesCopy.isEmpty {
            itinerary[days-1].places += placesCopy
        }
    }

    // --- Your sample data methods follow, unchanged ---
    static func samplePlannedTrips() -> [PlannedTrip] {
        [
            PlannedTrip(
                id: UUID(),
                destination: "Paris",
                startDate: Date(),
                endDate: Calendar.current.date(byAdding: .day, value: 5, to: Date())!,
                notes: "Excited for the trip!",
                itinerary: [],
                photoData: nil,
                latitude: nil,
                longitude: nil,
                placeName: "Eiffel Tower"
            ),
            PlannedTrip(
                id: UUID(),
                destination: "London",
                startDate: Date(),
                endDate: Calendar.current.date(byAdding: .day, value: 3, to: Date())!,
                notes: "Business trip.",
                itinerary: [],
                photoData: nil,
                latitude: nil,
                longitude: nil,
                placeName: nil
            )
        ]
    }

    static func sampleHistoryTrips() -> [PlannedTrip] {
        [
            PlannedTrip(
                id: UUID(),
                destination: "New York",
                startDate: Calendar.current.date(byAdding: .day, value: -10, to: Date())!,
                endDate: Calendar.current.date(byAdding: .day, value: -5, to: Date())!,
                notes: "Had a great time.",
                itinerary: [],
                photoData: nil,
                latitude: nil,
                longitude: nil,
                placeName: "Central Park"
            )
        ]
    }

    static func sampleNewPlanned() -> PlannedTrip {
        PlannedTrip(
            id: UUID(),
            destination: "New Trip",
            startDate: Date(),
            endDate: Calendar.current.date(byAdding: .day, value: 1, to: Date())!,
            notes: "",
            itinerary: [],
            photoData: nil,
            latitude: nil,
            longitude: nil,
            placeName: nil
        )
    }
}
