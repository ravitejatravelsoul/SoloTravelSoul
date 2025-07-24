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
    var isPlanned: Bool { true }

    // Sample Data
    static func samplePlannedTrips() -> [PlannedTrip] {
        [
            PlannedTrip(
                id: UUID(),
                destination: "Paris",
                startDate: Date(),
                endDate: Calendar.current.date(byAdding: .day, value: 5, to: Date())!,
                notes: "Excited for the trip!",
                itinerary: []
            ),
            PlannedTrip(
                id: UUID(),
                destination: "London",
                startDate: Date(),
                endDate: Calendar.current.date(byAdding: .day, value: 3, to: Date())!,
                notes: "Business trip.",
                itinerary: []
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
                itinerary: []
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
            itinerary: []
        )
    }
}
