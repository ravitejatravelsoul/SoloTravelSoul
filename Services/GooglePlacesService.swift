import Foundation
import CoreLocation

// MARK: - Google Places API Response Models
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

// MARK: - GooglePlacesService

final class GooglePlacesService {
    static let shared = GooglePlacesService()
    private init() {}

    private let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU" // <-- Replace with your real API key

    /// Main entry: Searches Google Places and returns [Place] using async/await.
    func searchPlaces(
        query: String,
        locationBias: (latitude: Double, longitude: Double)? = nil,
        pageSize: Int = 15
    ) async throws -> [Place] {
        guard let url = URL(string: "https://places.googleapis.com/v1/places:searchText?key=\(apiKey)") else {
            throw PlacesServiceError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("places.displayName,places.id,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.photos", forHTTPHeaderField: "X-Goog-FieldMask")

        var requestBody: [String: Any] = [
            "textQuery": query,
            "pageSize": pageSize,
            "languageCode": "en"
        ]

        // Only include locationBias if explicitly provided
        if let locationBias = locationBias {
            requestBody["locationBias"] = [
                "circle": [
                    "center": [
                        "latitude": locationBias.latitude,
                        "longitude": locationBias.longitude
                    ],
                    "radius": 25000 // 25km, returns broader/top results
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
        // Map PlaceResult to Place (imported model)
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

    /// Returns the top 15 famous attractions for a city or country (NO radius, just smart query)
    func fetchTopPlaces(for locationName: String) async throws -> [Place] {
        // This will use a smart text query to get the most famous places in the area, not just those within a radius.
        let query = "top attractions in \(locationName)"
        // Do NOT send locationBias, only text query!
        return try await searchPlaces(
            query: query,
            locationBias: nil,
            pageSize: 15
        )
    }

    /// Geocode city/country to coordinates (not used in fetchTopPlaces anymore, but kept for compatibility)
    private func geocode(location: String) async throws -> CLLocationCoordinate2D {
        return try await withCheckedThrowingContinuation { continuation in
            let geocoder = CLGeocoder()
            geocoder.geocodeAddressString(location) { placemarks, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let coord = placemarks?.first?.location?.coordinate {
                    continuation.resume(returning: coord)
                } else {
                    continuation.resume(throwing: PlacesServiceError.invalidResponse)
                }
            }
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
