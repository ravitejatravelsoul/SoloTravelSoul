import Foundation

public struct JournalEntry: Identifiable, Codable, Hashable, Equatable {
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

    public static func fromDict(_ dict: [String: Any]) -> JournalEntry? {
        guard
            let idString = dict["id"] as? String,
            let id = UUID(uuidString: idString),
            let date = dict["date"] as? Date,
            let text = dict["text"] as? String
        else { return nil }
        let photoData = (dict["photoData"] as? String).flatMap { Data(base64Encoded: $0) }
        return JournalEntry(id: id, date: date, text: text, photoData: photoData)
    }

    public func toDict() -> [String: Any] {
        var dict: [String: Any] = [
            "id": id.uuidString,
            "date": date,
            "text": text
        ]
        if let photoData = photoData {
            dict["photoData"] = photoData.base64EncodedString()
        }
        return dict
    }
}
