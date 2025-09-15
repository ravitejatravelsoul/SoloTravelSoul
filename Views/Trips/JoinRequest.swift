import Foundation
import FirebaseFirestore

public struct JoinRequest: Identifiable, Equatable {
    public let id: String       // This will be the user's UID
    public let name: String
    public let createdAt: Date?

    public init(id: String, name: String, createdAt: Date? = nil) {
        self.id = id
        self.name = name
        self.createdAt = createdAt
    }

    public static func fromDict(_ dict: [String: Any]) -> JoinRequest? {
        guard let id = dict["requestorId"] as? String,
              let name = dict["requestorName"] as? String else { return nil }
        // Firestore Timestamp -> Date
        let createdAtValue = dict["createdAt"]
        let createdAt: Date? = {
            if let timestamp = createdAtValue as? Timestamp {
                return timestamp.dateValue()
            } else if let timeInterval = createdAtValue as? TimeInterval {
                return Date(timeIntervalSince1970: timeInterval)
            }
            return nil
        }()
        return JoinRequest(id: id, name: name, createdAt: createdAt)
    }
}
