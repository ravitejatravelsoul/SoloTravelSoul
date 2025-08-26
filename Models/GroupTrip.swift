import Foundation

public struct GroupTrip: Identifiable, Equatable {
    public let id: String
    public var name: String
    public var destination: String
    public var startDate: Date
    public var endDate: Date
    public var description: String?
    public var activities: [String]?
    public var creator: UserProfile
    public var members: [UserProfile]
    public var admins: [String]
    public var requests: [UserProfile]
    public var joinRequests: [String]

    public init(
        id: String = UUID().uuidString,
        name: String,
        destination: String,
        startDate: Date,
        endDate: Date,
        description: String? = nil,
        activities: [String]? = nil,
        creator: UserProfile,
        members: [UserProfile] = [],
        admins: [String] = [],
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
        self.members = members
        self.admins = admins
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
            "members": members.map { $0.toDict() },
            "admins": admins,
            "requests": requests.map { $0.toDict() },
            "joinRequests": joinRequests
        ]
        // Only add description and activities if they exist
        if let desc = description { dict["description"] = desc }
        if let acts = activities { dict["activities"] = acts }
        return dict
    }

    public static func fromDict(_ dict: [String: Any]) -> GroupTrip? {
        guard
            let id = dict["id"] as? String,
            let name = dict["name"] as? String,
            let destination = dict["destination"] as? String,
            let startTimestamp = dict["startDate"] as? TimeInterval,
            let endTimestamp = dict["endDate"] as? TimeInterval,
            let creatorDict = dict["creator"] as? [String: Any],
            let creator = UserProfile.fromDict(creatorDict),
            let membersArray = dict["members"] as? [[String: Any]],
            let admins = dict["admins"] as? [String],
            let requestsArray = dict["requests"] as? [[String: Any]],
            let joinRequests = dict["joinRequests"] as? [String]
        else { return nil }
        let description = dict["description"] as? String
        let activities = dict["activities"] as? [String]
        let members = membersArray.compactMap { UserProfile.fromDict($0) }
        let requests = requestsArray.compactMap { UserProfile.fromDict($0) }
        return GroupTrip(
            id: id,
            name: name,
            destination: destination,
            startDate: Date(timeIntervalSince1970: startTimestamp),
            endDate: Date(timeIntervalSince1970: endTimestamp),
            description: description,
            activities: activities,
            creator: creator,
            members: members,
            admins: admins,
            requests: requests,
            joinRequests: joinRequests
        )
    }
}
