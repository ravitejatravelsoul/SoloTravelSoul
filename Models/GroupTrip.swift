import Foundation

public struct GroupTrip: Identifiable, Codable, Hashable {
    public var id: String?
    public var name: String
    public var destination: String
    public var startDate: Date
    public var endDate: Date
    public var description: String?
    public var imageUrl: String?
    public var activities: [String]
    public var members: [UserProfile]
    public var requests: [UserProfile]
    public var creator: UserProfile

    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
        hasher.combine(name)
        hasher.combine(destination)
        hasher.combine(startDate)
        hasher.combine(endDate)
        hasher.combine(description)
        hasher.combine(imageUrl)
        hasher.combine(activities)
        hasher.combine(members)
        hasher.combine(requests)
        hasher.combine(creator)
    }

    public static func == (lhs: GroupTrip, rhs: GroupTrip) -> Bool {
        return lhs.id == rhs.id &&
               lhs.name == rhs.name &&
               lhs.destination == rhs.destination &&
               lhs.startDate == rhs.startDate &&
               lhs.endDate == rhs.endDate &&
               lhs.description == rhs.description &&
               lhs.imageUrl == rhs.imageUrl &&
               lhs.activities == rhs.activities &&
               lhs.members == rhs.members &&
               lhs.requests == rhs.requests &&
               lhs.creator == rhs.creator
    }

    public func toDict() -> [String: Any] {
        return [
            "id": id ?? "",
            "name": name,
            "destination": destination,
            "startDate": startDate.timeIntervalSince1970,
            "endDate": endDate.timeIntervalSince1970,
            "description": description ?? "",
            "imageUrl": imageUrl ?? "",
            "activities": activities,
            "members": members.map { $0.toDict() },
            "requests": requests.map { $0.toDict() },
            "creator": creator.toDict()
        ]
    }

    public static func fromDict(_ dict: [String: Any]) -> GroupTrip? {
        guard let name = dict["name"] as? String,
              let destination = dict["destination"] as? String,
              let startInterval = dict["startDate"] as? TimeInterval,
              let endInterval = dict["endDate"] as? TimeInterval,
              let activities = dict["activities"] as? [String],
              let membersArr = dict["members"] as? [[String: Any]],
              let requestsArr = dict["requests"] as? [[String: Any]],
              let creatorDict = dict["creator"] as? [String: Any],
              let creator = UserProfile.fromDict(creatorDict)
        else { return nil }

        let members = membersArr.compactMap { UserProfile.fromDict($0) }
        let requests = requestsArr.compactMap { UserProfile.fromDict($0) }

        return GroupTrip(
            id: dict["id"] as? String,
            name: name,
            destination: destination,
            startDate: Date(timeIntervalSince1970: startInterval),
            endDate: Date(timeIntervalSince1970: endInterval),
            description: dict["description"] as? String,
            imageUrl: dict["imageUrl"] as? String,
            activities: activities,
            members: members,
            requests: requests,
            creator: creator
        )
    }
}
