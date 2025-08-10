import Foundation
import FirebaseFirestore

public struct ItineraryDay: Codable, Hashable, Equatable, Identifiable {
    public let id: UUID
    public var date: Date
    public var places: [Place]
    public var journalEntries: [JournalEntry]

    public init(id: UUID = UUID(), date: Date, places: [Place], journalEntries: [JournalEntry] = []) {
        self.id = id
        self.date = date
        self.places = places
        self.journalEntries = journalEntries
    }

    public static func fromDict(_ dict: [String: Any]) -> ItineraryDay? {
        guard
            let idString = dict["id"] as? String,
            let id = UUID(uuidString: idString),
            let dateTimestamp = dict["date"] as? Timestamp,
            let placesArray = dict["places"] as? [[String: Any]]
        else { return nil }

        let places = placesArray.compactMap { Place.fromDict($0) }
        // Optionally parse journalEntries if you store them
        let journalEntriesArray = dict["journalEntries"] as? [[String: Any]] ?? []
        let journalEntries = journalEntriesArray.compactMap { JournalEntry.fromDict($0) }

        return ItineraryDay(id: id, date: dateTimestamp.dateValue(), places: places, journalEntries: journalEntries)
    }

    public func toDict() -> [String: Any] {
        return [
            "id": id.uuidString,
            "date": Timestamp(date: date),
            "places": places.map { $0.toDict() },
            "journalEntries": journalEntries.map { $0.toDict() }
        ]
    }
}
