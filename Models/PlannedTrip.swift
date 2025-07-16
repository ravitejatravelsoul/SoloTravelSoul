import Foundation
import CoreLocation

struct PlannedTrip: Identifiable, Codable, Equatable {
    let id: UUID
    var destination: String
    var date: Date
    var notes: String
    var photoData: Data?
    var latitude: Double?
    var longitude: Double?

    init(
        id: UUID = UUID(),
        destination: String,
        date: Date,
        notes: String,
        photoData: Data? = nil,
        latitude: Double? = nil,
        longitude: Double? = nil
    ) {
        self.id = id
        self.destination = destination
        self.date = date
        self.notes = notes
        self.photoData = photoData
        self.latitude = latitude
        self.longitude = longitude
    }
}
