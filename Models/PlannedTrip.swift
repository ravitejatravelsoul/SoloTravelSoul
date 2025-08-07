import Foundation

public struct PlannedTrip: Identifiable, Codable, Hashable {
    public let id: UUID
    public var destination: String
    public var startDate: Date
    public var endDate: Date
    public var notes: String
    public var itinerary: [ItineraryDay]
    public var photoData: Data?
    public var latitude: Double?
    public var longitude: Double?
    public var placeName: String?
    public var members: [String]
    public var isPlanned: Bool { true }

    /// Returns all places across all days for optimization
    public var allPlaces: [Place] {
        itinerary.flatMap { $0.places }
    }

    // Replace all places in the itinerary with new optimized order, distributing by day
    public mutating func setOptimizedPlaces(_ places: [Place]) {
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

    // MARK: - Sample Data

    public static func samplePlannedTrips() -> [PlannedTrip] {
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
                placeName: "Eiffel Tower",
                members: ["Alice", "Bob", "Charlie"]
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
                placeName: nil,
                members: ["Diana", "Eve"]
            )
        ]
    }

    public static func sampleHistoryTrips() -> [PlannedTrip] {
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
                placeName: "Central Park",
                members: ["Sam", "Jane"]
            )
        ]
    }

    public static func sampleNewPlanned() -> PlannedTrip {
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
            placeName: nil,
            members: []
        )
    }
}
