import Foundation
import FirebaseFirestore

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

    public var allPlaces: [Place] {
        itinerary.flatMap { $0.places }
    }

    public mutating func setOptimizedPlaces(_ places: [Place]) {
        guard !itinerary.isEmpty else { return }
        let days = itinerary.count
        let perDay = max(1, places.count / days)
        var placesCopy = places
        for i in 0..<days {
            let slice = Array(placesCopy.prefix(perDay))
            itinerary[i].places = slice
            placesCopy = Array(placesCopy.dropFirst(perDay))
        }
        if !placesCopy.isEmpty {
            itinerary[days-1].places += placesCopy
        }
    }

    // MARK: - Firestore Serialization

    public static func fromDict(_ dict: [String: Any]) -> PlannedTrip? {
        guard
            let idString = dict["id"] as? String,
            let id = UUID(uuidString: idString),
            let destination = dict["destination"] as? String,
            let startTimestamp = dict["startDate"] as? Timestamp,
            let endTimestamp = dict["endDate"] as? Timestamp,
            let notes = dict["notes"] as? String,
            let itineraryArray = dict["itinerary"] as? [[String: Any]],
            let members = dict["members"] as? [String]
        else {
            return nil
        }

        let itinerary = itineraryArray.compactMap { ItineraryDay.fromDict($0) }
        let photoData = (dict["photoData"] as? String).flatMap { Data(base64Encoded: $0) }
        let latitude = dict["latitude"] as? Double
        let longitude = dict["longitude"] as? Double
        let placeName = dict["placeName"] as? String

        return PlannedTrip(
            id: id,
            destination: destination,
            startDate: startTimestamp.dateValue(),
            endDate: endTimestamp.dateValue(),
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
        return [
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

    // MARK: - Sample Data

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
                                types: ["tourist_attraction", "point_of_interest", "establishment"],
                                rating: 4.7,
                                userRatingsTotal: 100000,
                                photoReferences: ["places/ChIJLU7jZClu5kcR4PcOOO6p3I0/photos/ATtYBwKo0cGvQG9cA"],
                                reviews: nil,
                                openingHours: nil,
                                phoneNumber: nil,
                                website: nil
                            )
                        ],
                        journalEntries: []
                    )
                ],
                photoData: nil,
                latitude: nil,
                longitude: nil,
                placeName: "Eiffel Tower",
                members: ["Alice", "Bob", "Charlie"]
            ),
            PlannedTrip(
                id: UUID(),
                destination: "London",
                startDate: Date(),
                endDate: Calendar.current.date(byAdding: .day, value: 3, to: Date())!,
                notes: "Business trip.",
                itinerary: [
                    ItineraryDay(
                        date: Date(),
                        places: [
                            Place(
                                id: "ChIJdd4hrwug2EcRmSrV3Vo6llI",
                                name: "Big Ben",
                                address: "Westminster, London SW1A 0AA, United Kingdom",
                                latitude: 51.5007,
                                longitude: -0.1246,
                                types: ["tourist_attraction", "point_of_interest", "establishment"],
                                rating: 4.6,
                                userRatingsTotal: 90000,
                                photoReferences: ["places/ChIJdd4hrwug2EcRmSrV3Vo6llI/photos/ATtYBwL7"],
                                reviews: nil,
                                openingHours: nil,
                                phoneNumber: nil,
                                website: nil
                            )
                        ],
                        journalEntries: []
                    )
                ],
                photoData: nil,
                latitude: nil,
                longitude: nil,
                placeName: "Big Ben",
                members: ["Diana", "Eve"]
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
                itinerary: [
                    ItineraryDay(
                        date: Calendar.current.date(byAdding: .day, value: -10, to: Date())!,
                        places: [
                            Place(
                                id: "ChIJOwg_06VPwokRYv534QaPC8g",
                                name: "Central Park",
                                address: "New York, NY, USA",
                                latitude: 40.785091,
                                longitude: -73.968285,
                                types: ["park", "tourist_attraction", "point_of_interest", "establishment"],
                                rating: 4.8,
                                userRatingsTotal: 120000,
                                photoReferences: ["places/ChIJOwg_06VPwokRYv534QaPC8g/photos/ATtYBwKN"],
                                reviews: nil,
                                openingHours: nil,
                                phoneNumber: nil,
                                website: nil
                            )
                        ],
                        journalEntries: []
                    )
                ],
                photoData: nil,
                latitude: nil,
                longitude: nil,
                placeName: "Central Park",
                members: ["Sam", "Jane"]
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
            photoData: nil,
            latitude: nil,
            longitude: nil,
            placeName: nil,
            members: []
        )
    }
}
