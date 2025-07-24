import Foundation

struct Trip: Identifiable, Codable, Equatable {
    let id: UUID
    var destination: String
    var startDate: Date
    var endDate: Date
    var notes: String
    var isPlanned: Bool // true for planned, false for history
    var latitude: Double?
    var longitude: Double?
    static func samplePlannedTrips() -> [Trip] {
        [
            Trip(id: UUID(), destination: "San Francisco", startDate: Date().addingTimeInterval(86400 * 5), endDate: Date().addingTimeInterval(86400 * 10), notes: "Golden Gate Bridge visit", isPlanned: true),
            Trip(id: UUID(), destination: "Seattle", startDate: Date().addingTimeInterval(86400 * 20), endDate: Date().addingTimeInterval(86400 * 25), notes: "Space Needle adventure", isPlanned: true)
        ]
    }

    static func sampleHistoryTrips() -> [Trip] {
        [
            Trip(id: UUID(), destination: "New York", startDate: Date().addingTimeInterval(-86400 * 20), endDate: Date().addingTimeInterval(-86400 * 15), notes: "Central Park jog", isPlanned: false),
            Trip(id: UUID(), destination: "Austin", startDate: Date().addingTimeInterval(-86400 * 50), endDate: Date().addingTimeInterval(-86400 * 45), notes: "Live music nights", isPlanned: false)
        ]
    }

    static func sampleNewPlanned() -> Trip {
        Trip(id: UUID(), destination: "New Trip", startDate: Date(), endDate: Date().addingTimeInterval(86400 * 3), notes: "", isPlanned: true)
    }
}
