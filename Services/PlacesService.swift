import Foundation
import CoreLocation

struct GooglePlace: Codable {
    let name: String
    let place_id: String
    let geometry: Geometry
    let photos: [Photo]?
    let types: [String]
    let vicinity: String?
    
    struct Geometry: Codable {
        let location: Location
        struct Location: Codable {
            let lat: Double
            let lng: Double
        }
    }
    struct Photo: Codable {
        let photo_reference: String
    }
}

struct GooglePlacesResponse: Codable {
    let results: [GooglePlace]
    let status: String
}

class PlacesService {
    static let shared = PlacesService()
    let apiKey = "YOUR_GOOGLE_API_KEY_HERE" // Replace with your actual API key

    func fetchAttractions(
        keyword: String,
        location: CLLocationCoordinate2D,
        radius: Int = 50000, // meters
        type: String? = nil,
        completion: @escaping ([Attraction]?, Error?) -> Void
    ) {
        var urlString = "https://maps.googleapis.com/maps/api/place/nearbysearch/json?"
        urlString += "location=\(location.latitude),\(location.longitude)"
        urlString += "&radius=\(radius)"
        urlString += "&keyword=\(keyword.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"
        urlString += "&key=\(apiKey)"
        if let type = type {
            urlString += "&type=\(type)"
        }
        guard let url = URL(string: urlString) else {
            completion(nil, NSError(domain: "PlacesService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"]))
            return
        }
        URLSession.shared.dataTask(with: url) { data, response, error in
            if let data = data {
                do {
                    let decoded = try JSONDecoder().decode(GooglePlacesResponse.self, from: data)
                    let attractions = decoded.results.map { place in
                        Attraction(
                            id: UUID(),
                            name: place.name,
                            description: place.vicinity ?? "",
                            type: keyword.capitalized,
                            state: "",
                            city: nil,
                            imageName: place.photos?.first?.photo_reference ?? "",
                            latitude: place.geometry.location.lat,
                            longitude: place.geometry.location.lng
                        )
                    }
                    completion(attractions, nil)
                } catch {
                    completion(nil, error)
                }
            } else {
                completion(nil, error)
            }
        }.resume()
    }
    
    // Helper to get photo URL from photo_reference
    func photoURL(forReference ref: String, maxWidth: Int = 400) -> URL? {
        guard !ref.isEmpty else { return nil }
        let urlString = "https://maps.googleapis.com/maps/api/place/photo?maxwidth=\(maxWidth)&photoreference=\(ref)&key=\(apiKey)"
        return URL(string: urlString)
    }
}
