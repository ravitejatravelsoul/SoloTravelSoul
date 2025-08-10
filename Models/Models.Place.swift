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

    public static func fromDict(_ dict: [String: Any]) -> Place? {
        guard let id = dict["id"] as? String,
              let name = dict["name"] as? String,
              let latitude = dict["latitude"] as? Double,
              let longitude = dict["longitude"] as? Double
        else { return nil }
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
            reviews: nil, // Add parsing if needed
            openingHours: nil, // Add parsing if needed
            phoneNumber: dict["phoneNumber"] as? String,
            website: dict["website"] as? String,
            journalEntries: nil // Add parsing if needed
        )
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
        dict["phoneNumber"] = phoneNumber
        dict["website"] = website
        // Add other fields as needed
        return dict
    }
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
