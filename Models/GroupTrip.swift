import Foundation

public struct GroupTrip: Identifiable, Codable, Hashable {
    public let id: String
    public var destination: String
    public var startDate: Date
    public var endDate: Date
    public var members: [String] // Use [User] if you have a User model
    public var imageUrl: String?
    public var notes: String?

    public init(
        id: String,
        destination: String,
        startDate: Date,
        endDate: Date,
        members: [String],
        imageUrl: String? = nil,
        notes: String? = nil
    ) {
        self.id = id
        self.destination = destination
        self.startDate = startDate
        self.endDate = endDate
        self.members = members
        self.imageUrl = imageUrl
        self.notes = notes
    }
}
