import Foundation

struct Place: Identifiable, Codable, Hashable, Equatable {
    let id: String
    let name: String
    let address: String?
    let latitude: Double
    let longitude: Double
    let types: [String]?
    let rating: Double?
    let userRatingsTotal: Int?
    let photoReference: String?
}
