import Foundation

public struct GroupTrip: Codable, Identifiable, Hashable {
    public let id: String
    public var name: String
    public var destination: String
    public var startDate: Date
    public var endDate: Date
    public var description: String?
    public var activities: [String]?
    public var creator: UserProfile
    public var admins: [String] // user IDs of admins (besides creator)
    public var members: [UserProfile]
    public var requests: [UserProfile]
    public var joinRequests: [String] // user IDs

    public var leaderProfile: UserProfile? {
        return creator
    }

    public init(
        id: String = UUID().uuidString,
        name: String,
        destination: String,
        startDate: Date,
        endDate: Date,
        description: String? = nil,
        activities: [String]? = nil,
        creator: UserProfile,
        admins: [String] = [],
        members: [UserProfile] = [],
        requests: [UserProfile] = [],
        joinRequests: [String] = []
    ) {
        self.id = id
        self.name = name
        self.destination = destination
        self.startDate = startDate
        self.endDate = endDate
        self.description = description
        self.activities = activities
        self.creator = creator
        self.admins = admins
        self.members = members
        self.requests = requests
        self.joinRequests = joinRequests
    }

    public func toDict() -> [String: Any] {
        var dict: [String: Any] = [
            "id": id,
            "name": name,
            "destination": destination,
            "startDate": startDate.timeIntervalSince1970,
            "endDate": endDate.timeIntervalSince1970,
            "creator": creator.toDict(),
            "admins": admins,
            "members": members.map { $0.toDict() },
            "requests": requests.map { $0.toDict() },
            "joinRequests": joinRequests
        ]
        dict["description"] = description ?? ""
        dict["activities"] = activities ?? []
        return dict
    }

    public static func fromDict(_ dict: [String: Any]) -> GroupTrip? {
        guard
            let id = dict["id"] as? String,
            let name = dict["name"] as? String,
            let destination = dict["destination"] as? String,
            let startDateTS = dict["startDate"] as? TimeInterval,
            let endDateTS = dict["endDate"] as? TimeInterval,
            let creatorDict = dict["creator"] as? [String: Any],
            let creator = UserProfile.fromDict(creatorDict)
        else { return nil }

        let description = dict["description"] as? String
        let activities = dict["activities"] as? [String]
        let admins = dict["admins"] as? [String] ?? []
        let members = (dict["members"] as? [[String: Any]])?.compactMap(UserProfile.fromDict) ?? []
        let requests = (dict["requests"] as? [[String: Any]])?.compactMap(UserProfile.fromDict) ?? []
        let joinRequests = dict["joinRequests"] as? [String] ?? []

        return GroupTrip(
            id: id,
            name: name,
            destination: destination,
            startDate: Date(timeIntervalSince1970: startDateTS),
            endDate: Date(timeIntervalSince1970: endDateTS),
            description: description,
            activities: activities,
            creator: creator,
            admins: admins,
            members: members,
            requests: requests,
            joinRequests: joinRequests
        )
    }
}
