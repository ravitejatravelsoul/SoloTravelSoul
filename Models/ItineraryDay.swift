import Foundation

struct ItineraryDay: Identifiable, Codable, Hashable {
    let id: UUID
    var date: Date
    var places: [Place]

    init(id: UUID = UUID(), date: Date, places: [Place] = []) {
        self.id = id
        self.date = date
        self.places = places
    }
}
