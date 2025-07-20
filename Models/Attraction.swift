import Foundation

struct Attraction: Identifiable {
    let id: UUID
    let name: String
    let description: String
    let type: String
    let state: String
    let city: String?
    let imageName: String
    let latitude: Double
    let longitude: Double
}
