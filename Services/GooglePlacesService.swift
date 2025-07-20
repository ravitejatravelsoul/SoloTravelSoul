import Foundation

struct Place: Identifiable, Codable {
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

private struct PlacesSearchResponse: Codable {
    let places: [PlaceResult]?
}

private struct PlaceResult: Codable {
    let id: String
    let displayName: DisplayName?
    let formattedAddress: String?
    let location: LatLng?
    let types: [String]?
    let rating: Double?
    let userRatingCount: Int?
    let photos: [Photo]?
}

private struct DisplayName: Codable {
    let text: String?
}

private struct LatLng: Codable {
    let latitude: Double
    let longitude: Double
}

private struct Photo: Codable {
    let name: String?
}

final class GooglePlacesService {
    static let shared = GooglePlacesService()
    private init() {}

    private let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU" // <-- Replace with your new API key

    // Optionally add locationBias parameter
    func searchPlaces(query: String, locationBias: (latitude: Double, longitude: Double)? = nil) async throws -> [Place] {
        guard let url = URL(string: "https://places.googleapis.com/v1/places:searchText?key=\(apiKey)") else {
            throw PlacesServiceError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("places.displayName,places.id,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.photos", forHTTPHeaderField: "X-Goog-FieldMask")

        var requestBody: [String: Any] = [
            "textQuery": query,
            "pageSize": 10,
            "languageCode": "en"
        ]

        if let locationBias = locationBias {
            requestBody["locationBias"] = [
                "circle": [
                    "center": [
                        "latitude": locationBias.latitude,
                        "longitude": locationBias.longitude
                    ],
                    "radius": 10000 // meters, adjust as needed
                ]
            ]
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody, options: [])

        let (data, response) = try await URLSession.shared.data(for: request)

        if let httpResponse = response as? HTTPURLResponse {
            print("Status code: \(httpResponse.statusCode)")
        }

        if let rawString = String(data: data, encoding: .utf8) {
            print("RAW JSON RESPONSE: \(rawString)")
        }

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw PlacesServiceError.invalidResponse
        }

        let decoded = try JSONDecoder().decode(PlacesSearchResponse.self, from: data)
        let results = decoded.places ?? []
        print("Decoded results: \(results.count)")
        return results.map { result in
            Place(
                id: result.id,
                name: result.displayName?.text ?? "",
                address: result.formattedAddress,
                latitude: result.location?.latitude ?? 0.0,
                longitude: result.location?.longitude ?? 0.0,
                types: result.types,
                rating: result.rating,
                userRatingsTotal: result.userRatingCount,
                photoReference: result.photos?.first?.name
            )
        }
    }
}

enum PlacesServiceError: Error, LocalizedError {
    case invalidURL
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL for Google Places API."
        case .invalidResponse:
            return "Received invalid response from Google Places API."
        }
    }
}
