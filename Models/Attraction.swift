import Foundation
import CoreLocation

struct Attraction: Identifiable, Codable, Equatable {
    let id: UUID
    let name: String
    let description: String
    let type: String           // e.g., "Beach", "Hiking", "Park"
    let state: String          // e.g., "California"
    let city: String?
    let imageName: String      // For Google, this will be photo_reference or empty
    let latitude: Double?
    let longitude: Double?
}
