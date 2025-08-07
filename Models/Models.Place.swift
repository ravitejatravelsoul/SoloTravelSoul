import Foundation

public struct Place: Identifiable, Codable, Hashable, Equatable {
    public let id: String
    public let name: String
    public let address: String?
    public let latitude: Double
    public let longitude: Double
    public let types: [String]?
    public let rating: Double?
    public let userRatingsTotal: Int?
    public let photoReferences: [String]?
    public let reviews: [PlaceReview]?
    public let openingHours: PlaceOpeningHours?
    public let phoneNumber: String?
    public let website: String?
    
    // Per-place journal entries
    public var journalEntries: [JournalEntry]?
}

public struct PlaceReview: Codable, Hashable, Equatable {
    public let author_name: String?
    public let rating: Double?
    public let text: String?
    public let relative_time_description: String?
}

public struct PlaceOpeningHours: Codable, Hashable, Equatable {
    public let open_now: Bool?
    public let weekday_text: [String]?
}
