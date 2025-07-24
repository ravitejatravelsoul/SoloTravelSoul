import Foundation

struct ItineraryDay: Identifiable, Codable, Equatable, Hashable {
    let id: UUID
    var date: Date
    var places: [ItineraryPlace]

    init(date: Date, places: [ItineraryPlace] = []) {
        self.id = UUID()
        self.date = date
        self.places = places
    }
}
