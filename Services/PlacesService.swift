import Foundation
import CoreLocation

// MARK: - Google Places API (New) Models

struct GooglePlace: Codable {
    let id: String
    let displayName: DisplayName?
    let formattedAddress: String?
    let location: LatLng?
    let types: [String]?
    let rating: Double?
    let userRatingCount: Int?
    let photos: [Photo]?

    struct DisplayName: Codable {
        let text: String?
    }
    struct LatLng: Codable {
        let latitude: Double
        let longitude: Double
    }
    struct Photo: Codable {
        let name: String?
    }
}

struct GooglePlacesResponse: Codable {
    let places: [GooglePlace]?
}

class PlacesService {
    static let shared = PlacesService()
    let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU" // <-- Replace with your actual API key

    func fetchAttractions(
        keyword: String,
        location: CLLocationCoordinate2D? = nil,
        pageSize: Int = 10,
        completion: @escaping ([Attraction]?, Error?) -> Void
    ) {
        guard let url = URL(string: "https://places.googleapis.com/v1/places:searchText?key=\(apiKey)") else {
            completion(nil, NSError(domain: "PlacesService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"]))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("places.displayName,places.id,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.photos", forHTTPHeaderField: "X-Goog-FieldMask")

        var requestBody: [String: Any] = [
            "textQuery": keyword,
            "pageSize": pageSize,
            "languageCode": "en"
        ]
        if let location = location {
            let radius = 50000
            requestBody["locationBias"] = [
                "circle": [
                    "center": [
                        "latitude": location.latitude,
                        "longitude": location.longitude
                    ],
                    "radius": radius
                ]
            ]
        }

        // Debug: print outgoing JSON and headers
        if let json = try? JSONSerialization.data(withJSONObject: requestBody, options: .prettyPrinted),
           let jsonString = String(data: json, encoding: .utf8) {
            print("DEBUG Request JSON: \(jsonString)")
        }
        print("DEBUG HEADERS: \(request.allHTTPHeaderFields ?? [:])")

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody, options: [])
        } catch {
            completion(nil, error)
            return
        }

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let data = data {
                if let rawString = String(data: data, encoding: .utf8) {
                    print("RAW JSON RESPONSE: \(rawString)")
                }
                do {
                    let decoded = try JSONDecoder().decode(GooglePlacesResponse.self, from: data)
                    let attractions: [Attraction] = (decoded.places ?? []).map { place in
                        Attraction(
                            id: UUID(),
                            name: place.displayName?.text ?? "",
                            description: place.formattedAddress ?? "",
                            type: keyword.capitalized,
                            state: "",
                            city: nil,
                            imageName: place.photos?.first?.name ?? "",
                            latitude: place.location?.latitude ?? 0.0,
                            longitude: place.location?.longitude ?? 0.0
                        )
                    }
                    completion(attractions, nil)
                } catch {
                    completion(nil, error)
                }
            } else {
                completion(nil, error)
            }
        }
        task.resume()
    }

    func photoURL(forReference ref: String, maxWidth: Int = 400) -> URL? {
        guard !ref.isEmpty else { return nil }
        let urlString = "https://places.googleapis.com/v1/\(ref)/media?key=\(apiKey)&maxWidthPx=\(maxWidth)"
        return URL(string: urlString)
    }
}
