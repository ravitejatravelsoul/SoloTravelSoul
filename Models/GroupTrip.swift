import Foundation
import FirebaseFirestore

public struct GroupTrip: Identifiable, Hashable, Codable {
    public var id: String?                 // Firestore document ID
    public var name: String
    public var destination: String
    public var startDate: Date
    public var endDate: Date
    public var description: String?
    public var activities: [String]
    public var members: [UserProfile]      // full profiles
    public var requests: [UserProfile]     // pending join requests
    public var creator: UserProfile
    public var linkedTripIDs: [String]     // planned trip IDs (optional usage)
    public var joinRequests: [String]      // raw user IDs (fallback)

    public init(
        id: String? = nil,
        name: String,
        destination: String,
        startDate: Date,
        endDate: Date,
        description: String?,
        activities: [String],
        members: [UserProfile],
        requests: [UserProfile],
        creator: UserProfile,
        linkedTripIDs: [String] = [],
        joinRequests: [String] = []
    ) {
        self.id = id
        self.name = name
        self.destination = destination
        self.startDate = startDate
        self.endDate = endDate
        self.description = description
        self.activities = activities
        self.members = members
        self.requests = requests
        self.creator = creator
        self.linkedTripIDs = linkedTripIDs
        self.joinRequests = joinRequests
    }

    public func toDict() -> [String: Any] {
        [
            "name": name,
            "destination": destination,
            "startDate": startDate.timeIntervalSince1970,
            "endDate": endDate.timeIntervalSince1970,
            "description": description as Any,
            "activities": activities,
            "members": members.map { $0.toDict() },
            "requests": requests.map { $0.toDict() },
            "creator": creator.toDict(),
            "linkedTripIDs": linkedTripIDs,
            "joinRequests": joinRequests
        ]
    }

    public static func fromDict(_ dict: [String: Any]) -> GroupTrip? {
        guard
            let name = dict["name"] as? String,
            let destination = dict["destination"] as? String,
            let startInterval = dict["startDate"] as? TimeInterval,
            let endInterval = dict["endDate"] as? TimeInterval,
            let activities = dict["activities"] as? [String],
            let creatorDict = dict["creator"] as? [String: Any],
            let creator = UserProfile.fromDict(creatorDict)
        else { return nil }

        let members = (dict["members"] as? [[String: Any]] ?? []).compactMap { UserProfile.fromDict($0) }
        let requests = (dict["requests"] as? [[String: Any]] ?? []).compactMap { UserProfile.fromDict($0) }
        let linkedTripIDs = dict["linkedTripIDs"] as? [String] ?? []
        let joinRequests = dict["joinRequests"] as? [String] ?? []

        return GroupTrip(
            id: dict["id"] as? String,
            name: name,
            destination: destination,
            startDate: Date(timeIntervalSince1970: startInterval),
            endDate: Date(timeIntervalSince1970: endInterval),
            description: dict["description"] as? String,
            activities: activities,
            members: members,
            requests: requests,
            creator: creator,
            linkedTripIDs: linkedTripIDs,
            joinRequests: joinRequests
        )
    }
}
