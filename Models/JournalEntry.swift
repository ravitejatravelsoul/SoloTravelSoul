import Foundation

public struct JournalEntry: Identifiable, Codable, Hashable {
    public let id: UUID
    public var date: Date
    public var text: String
    public var photoData: Data?

    public init(id: UUID = UUID(), date: Date, text: String, photoData: Data? = nil) {
        self.id = id
        self.date = date
        self.text = text
        self.photoData = photoData
    }
}
