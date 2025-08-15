//
//  JournalEntry 3.swift
//  SoloTravelSoul
//
//  Created by Raviteja on 8/14/25.
//


import Foundation
import FirebaseFirestore

// MARK: - JournalEntry
public struct JournalEntry: Identifiable, Codable, Hashable {
    public let id: UUID
    public var date: Date
    public var text: String
    public var photoData: Data?

    public init(
        id: UUID = UUID(),
        date: Date,
        text: String,
        photoData: Data? = nil
    ) {
        self.id = id
        self.date = date
        self.text = text
        self.photoData = photoData
    }

    public func toDict() -> [String: Any] {
        var dict: [String: Any] = [
            "id": id.uuidString,
            "date": Timestamp(date: date),
            "text": text
        ]
        if let photoData {
            dict["photoData"] = photoData.base64EncodedString()
        }
        return dict
    }

    public static func fromDict(_ dict: [String: Any]) -> JournalEntry? {
        guard
            let idString = dict["id"] as? String,
            let uuid = UUID(uuidString: idString),
            let ts = dict["date"] as? Timestamp,
            let text = dict["text"] as? String
        else { return nil }

        let photoData: Data? = (dict["photoData"] as? String).flatMap { Data(base64Encoded: $0) }

        return JournalEntry(
            id: uuid,
            date: ts.dateValue(),
            text: text,
            photoData: photoData
        )
    }
}

// MARK: - ItineraryDay
public struct ItineraryDay: Identifiable, Codable, Hashable {
    public let id: UUID
    public var date: Date
    public var places: [Place]
    public var journalEntries: [JournalEntry]

    public init(
        id: UUID = UUID(),
        date: Date,
        places: [Place],
        journalEntries: [JournalEntry] = []
    ) {
        self.id = id
        self.date = date
        self.places = places
        self.journalEntries = journalEntries
    }

    public func toDict() -> [String: Any] {
        return [
            "id": id.uuidString,
            "date": Timestamp(date: date),
            "places": places.map { $0.toDict() },
            "journalEntries": journalEntries.map { $0.toDict() }
        ]
    }

    public static func fromDict(_ dict: [String: Any]) -> ItineraryDay? {
        guard
            let idString = dict["id"] as? String,
            let uuid = UUID(uuidString: idString),
            let ts = dict["date"] as? Timestamp,
            let placesArray = dict["places"] as? [[String: Any]]
        else { return nil }

        let places: [Place] = placesArray.compactMap { Place.fromDict($0) }
        let journalEntries: [JournalEntry] =
            (dict["journalEntries"] as? [[String: Any]] ?? []).compactMap { JournalEntry.fromDict($0) }

        return ItineraryDay(
            id: uuid,
            date: ts.dateValue(),
            places: places,
            journalEntries: journalEntries
        )
    }
}

// MARK: - PlannedTrip
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

    public init(
        id: UUID = UUID(),
        destination: String,
        startDate: Date,
        endDate: Date,
        notes: String = "",
        itinerary: [ItineraryDay] = [],
        photoData: Data? = nil,
        latitude: Double? = nil,
        longitude: Double? = nil,
        placeName: String? = nil,
        members: [String] = []
    ) {
        self.id = id
        self.destination = destination
        self.startDate = startDate
        self.endDate = endDate
        self.notes = notes
        self.itinerary = itinerary
        self.photoData = photoData
        self.latitude = latitude
        self.longitude = longitude
        self.placeName = placeName
        self.members = members
    }

    // Short convenience initializer (used elsewhere in project)
    public init(id: UUID, destination: String, startDate: Date, endDate: Date) {
        self.init(
            id: id,
            destination: destination,
            startDate: startDate,
            endDate: endDate,
            notes: "",
            itinerary: [],
            photoData: nil,
            latitude: nil,
            longitude: nil,
            placeName: nil,
            members: []
        )
    }

    public var allPlaces: [Place] {
        itinerary.flatMap { $0.places }
    }

    public mutating func setOptimizedPlaces(_ places: [Place]) {
        guard !itinerary.isEmpty else { return }
        let days = itinerary.count
        let perDay = max(1, places.count / max(days, 1))
        var remaining = places
        for i in 0..<days {
            let slice = Array(remaining.prefix(perDay))
            itinerary[i].places = slice
            remaining = Array(remaining.dropFirst(perDay))
        }
        if !remaining.isEmpty, days > 0 {
            itinerary[days - 1].places += remaining
        }
    }

    // Journal convenience
    public mutating func addJournalEntry(_ entry: JournalEntry, toDay dayId: UUID) {
        guard let idx = itinerary.firstIndex(where: { $0.id == dayId }) else { return }
        itinerary[idx].journalEntries.append(entry)
    }

    // Firestore Serialization
    public static func fromDict(_ dict: [String: Any]) -> PlannedTrip? {
        guard
            let idString = dict["id"] as? String,
            let id = UUID(uuidString: idString),
            let destination = dict["destination"] as? String,
            let startTS = dict["startDate"] as? Timestamp,
            let endTS = dict["endDate"] as? Timestamp,
            let notes = dict["notes"] as? String,
            let itineraryArray = dict["itinerary"] as? [[String: Any]],
            let members = dict["members"] as? [String]
        else { return nil }

        let itinerary = itineraryArray.compactMap { ItineraryDay.fromDict($0) }
        let photoData = (dict["photoData"] as? String).flatMap { Data(base64Encoded: $0) }
        let latitude = dict["latitude"] as? Double
        let longitude = dict["longitude"] as? Double
        let placeName = dict["placeName"] as? String

        return PlannedTrip(
            id: id,
            destination: destination,
            startDate: startTS.dateValue(),
            endDate: endTS.dateValue(),
            notes: notes,
            itinerary: itinerary,
            photoData: photoData,
            latitude: latitude,
            longitude: longitude,
            placeName: placeName,
            members: members
        )
    }

    public func toDict() -> [String: Any] {
        [
            "id": id.uuidString,
            "destination": destination,
            "startDate": Timestamp(date: startDate),
            "endDate": Timestamp(date: endDate),
            "notes": notes,
            "itinerary": itinerary.map { $0.toDict() },
            "photoData": photoData?.base64EncodedString() as Any,
            "latitude": latitude as Any,
            "longitude": longitude as Any,
            "placeName": placeName as Any,
            "members": members
        ]
    }

    // Sample Data (trimmed to essentials)
    public static func samplePlannedTrips() -> [PlannedTrip] {
        [
            PlannedTrip(
                id: UUID(),
                destination: "Paris",
                startDate: Date(),
                endDate: Calendar.current.date(byAdding: .day, value: 5, to: Date())!,
                notes: "Excited for the trip!",
                itinerary: [
                    ItineraryDay(
                        date: Date(),
                        places: [
                            Place(
                                id: "ChIJLU7jZClu5kcR4PcOOO6p3I0",
                                name: "Eiffel Tower",
                                address: "Champ de Mars, 5 Avenue Anatole France, 75007 Paris, France",
                                latitude: 48.8584,
                                longitude: 2.2945,
                                types: ["tourist_attraction"],
                                rating: 4.7,
                                userRatingsTotal: 100000,
                                photoReferences: ["places/ChIJLU7jZClu5kcR4PcOOO6p3I0/photos/ATtY..."],
                                reviews: nil,
                                openingHours: nil,
                                phoneNumber: nil,
                                website: nil
                            )
                        ],
                        journalEntries: []
                    )
                ],
                placeName: "Eiffel Tower",
                members: ["Alice", "Bob"]
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
                placeName: "Central Park",
                members: ["Sam"]
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
            members: []
        )
    }
}