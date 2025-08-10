import Foundation

public struct ItineraryDay: Identifiable, Codable, Hashable {
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
}
