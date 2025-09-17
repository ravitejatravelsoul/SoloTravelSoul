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
    public var journalEntries: [JournalEntry]? // If you use this

    public init(
        id: String,
        name: String,
        address: String?,
        latitude: Double,
        longitude: Double,
        types: [String]?,
        rating: Double?,
        userRatingsTotal: Int?,
        photoReferences: [String]?,
        reviews: [PlaceReview]?,
        openingHours: PlaceOpeningHours?,
        phoneNumber: String?,
        website: String?,
        journalEntries: [JournalEntry]? = nil
    ) {
        self.id = id
        self.name = name
        self.address = address
        self.latitude = latitude
        self.longitude = longitude
        self.types = types
        self.rating = rating
        self.userRatingsTotal = userRatingsTotal
        self.photoReferences = photoReferences
        self.reviews = reviews
        self.openingHours = openingHours
        self.phoneNumber = phoneNumber
        self.website = website
        self.journalEntries = journalEntries
    }

    public func toDict() -> [String: Any] {
        var dict: [String: Any] = [
            "id": id,
            "name": name,
            "latitude": latitude,
            "longitude": longitude
        ]
        dict["address"] = address
        dict["types"] = types
        dict["rating"] = rating
        dict["userRatingsTotal"] = userRatingsTotal
        dict["photoReferences"] = photoReferences
        dict["reviews"] = reviews?.map { $0.toDict() }
        dict["openingHours"] = openingHours?.toDict()
        dict["phoneNumber"] = phoneNumber
        dict["website"] = website
        dict["journalEntries"] = journalEntries?.map { $0.toDict() }
        return dict
    }

    public static func fromDict(_ dict: [String: Any]) -> Place? {
        guard let id = dict["id"] as? String,
              let name = dict["name"] as? String,
              let latitude = dict["latitude"] as? Double,
              let longitude = dict["longitude"] as? Double
        else { return nil }
        let reviewsArray = dict["reviews"] as? [[String: Any]]
        let reviews = reviewsArray?.compactMap { PlaceReview.fromDict($0) }
        let openingHoursDict = dict["openingHours"] as? [String: Any]
        let openingHours = openingHoursDict.flatMap { PlaceOpeningHours.fromDict($0) }
        let journalEntriesArray = dict["journalEntries"] as? [[String: Any]]
        let journalEntries = journalEntriesArray?.compactMap { JournalEntry.fromDict($0) }
        return Place(
            id: id,
            name: name,
            address: dict["address"] as? String,
            latitude: latitude,
            longitude: longitude,
            types: dict["types"] as? [String],
            rating: dict["rating"] as? Double,
            userRatingsTotal: dict["userRatingsTotal"] as? Int,
            photoReferences: dict["photoReferences"] as? [String],
            reviews: reviews,
            openingHours: openingHours,
            phoneNumber: dict["phoneNumber"] as? String,
            website: dict["website"] as? String,
            journalEntries: journalEntries
        )
    }
}

public struct PlaceReview: Codable, Hashable, Equatable, Identifiable {
    public let authorName: String?
    public let rating: Double?
    public let text: String?
    public let relativeTimeDescription: String?
    public var id: String { [authorName ?? "", text ?? "", relativeTimeDescription ?? ""].joined(separator: "|") }

    enum CodingKeys: String, CodingKey {
        case authorName = "author_name"
        case rating
        case text
        case relativeTimeDescription = "relative_time_description"
    }

    public func toDict() -> [String: Any] {
        return [
            "author_name": authorName as Any,
            "rating": rating as Any,
            "text": text as Any,
            "relative_time_description": relativeTimeDescription as Any
        ]
    }
    public static func fromDict(_ dict: [String: Any]) -> PlaceReview? {
        return PlaceReview(
            authorName: dict["author_name"] as? String,
            rating: dict["rating"] as? Double,
            text: dict["text"] as? String,
            relativeTimeDescription: dict["relative_time_description"] as? String
        )
    }
}

public struct PlaceOpeningHours: Codable, Hashable, Equatable {
    public let openNow: Bool?
    public let weekdayText: [String]?

    enum CodingKeys: String, CodingKey {
        case openNow = "open_now"
        case weekdayText = "weekday_text"
    }

    public func toDict() -> [String: Any] {
        return [
            "open_now": openNow as Any,
            "weekday_text": weekdayText as Any
        ]
    }
    public static func fromDict(_ dict: [String: Any]) -> PlaceOpeningHours? {
        return PlaceOpeningHours(
            openNow: dict["open_now"] as? Bool,
            weekdayText: dict["weekday_text"] as? [String]
        )
    }
}
