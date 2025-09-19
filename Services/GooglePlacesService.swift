import Foundation
import CoreLocation

// Make sure to import your models if in a separate module:
// import Models

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
private struct DisplayName: Codable { let text: String? }
private struct LatLng: Codable { let latitude: Double; let longitude: Double }
private struct Photo: Codable { let name: String? }

private struct PlaceDetailsResponse: Codable {
    let result: PlaceDetailsResult?
}
private struct PlaceDetailsResult: Codable {
    let name: String
    let formatted_address: String?
    let geometry: PlaceGeometry
    let types: [String]?
    let rating: Double?
    let user_ratings_total: Int?
    let photos: [PlacePhoto]?
    let reviews: [PlaceReview]?
    let opening_hours: PlaceOpeningHours?
    let formatted_phone_number: String?
    let website: String?
}
private struct PlaceGeometry: Codable { let location: PlaceLocation }
private struct PlaceLocation: Codable { let lat: Double; let lng: Double }
private struct PlacePhoto: Codable { let photo_reference: String }

final class GooglePlacesService {
    static let shared = GooglePlacesService()
    private init() {}

    /// The Google Places API key.  Do **not** commit your API key in source code.
    /// Instead, read the `GooglePlacesAPIKey` entry from your app's Info.plist.  If no entry is
    /// found, an empty string is used and API requests will fail.  Make sure to add the
    /// appropriate key in Info.plist.
    private let apiKey: String = {
        if let key = Bundle.main.object(forInfoDictionaryKey: "GooglePlacesAPIKey") as? String {
            return key
        }
        return ""
    }()

    /// Generic search for places using a text query. Optionally filter by type (e.g. "restaurant").
    func searchPlaces(
        query: String,
        locationBias: (latitude: Double, longitude: Double)? = nil,
        pageSize: Int = 15,
        type: String? = nil // NEW: type filter (e.g., "restaurant")
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
        if let locationBias = locationBias {
            requestBody["locationBias"] = [
                "circle": [
                    "center": [
                        "latitude": locationBias.latitude,
                        "longitude": locationBias.longitude
                    ],
                    "radius": 25000
                ]
            ]
        }
        if let type = type {
            requestBody["includedTypes"] = [type] // Google API expects array for includedTypes
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: requestBody, options: [])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw PlacesServiceError.invalidResponse
        }
        let decoded = try JSONDecoder().decode(PlacesSearchResponse.self, from: data)
        let results = decoded.places ?? []
        var places: [Place] = []
        for result in results {
            let id = result.id
            let name = result.displayName?.text ?? ""
            let address = result.formattedAddress
            let latitude = result.location?.latitude ?? 0.0
            let longitude = result.location?.longitude ?? 0.0
            let types = result.types
            let rating = result.rating
            let userRatingsTotal = result.userRatingCount
            let photoReferences = result.photos?.compactMap { $0.name }
            // NEW: Assign category based on type
            let category: String?
            if let t = types, t.contains(where: { $0.lowercased().contains("restaurant") }) {
                category = "food"
            } else {
                category = "attraction"
            }
            let place = Place(
                id: id,
                name: name,
                address: address,
                latitude: latitude,
                longitude: longitude,
                types: types,
                rating: rating,
                userRatingsTotal: userRatingsTotal,
                photoReferences: photoReferences,
                reviews: nil,
                openingHours: nil,
                phoneNumber: nil,
                website: nil,
                journalEntries: nil,
                category: category
            )
            places.append(place)
        }
        return places
    }

    /// Fetches top attractions for a location (used for main itinerary).
    func fetchTopPlaces(for locationName: String) async throws -> [Place] {
        let query = "top attractions in \(locationName)"
        // Only return attractions (not restaurants)
        let all = try await searchPlaces(query: query, locationBias: nil, pageSize: 15)
        // Filter out restaurants if any slipped in
        return all.filter { $0.category != "food" }
    }

    /// Fetches food/restaurant places for a location (used for food in itinerary).
    func fetchFoodPlaces(for locationName: String) async throws -> [Place] {
        let query = "\(locationName) local food"
        // Only return places of type restaurant, and mark as category "food"
        let foods = try await searchPlaces(query: query, locationBias: nil, pageSize: 10, type: "restaurant")
        return foods.map { place in
            var p = place
            p.category = "food"
            return p
        }
    }

    func fetchPlaceDetails(placeID: String) async throws -> Place {
        let urlString = "https://maps.googleapis.com/maps/api/place/details/json?place_id=\(placeID)&fields=name,rating,formatted_address,geometry,types,photos,user_ratings_total,reviews,opening_hours,formatted_phone_number,website&key=\(apiKey)"
        guard let url = URL(string: urlString) else {
            throw PlacesServiceError.invalidURL
        }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw PlacesServiceError.invalidResponse
        }
        let decoded = try JSONDecoder().decode(PlaceDetailsResponse.self, from: data)
        guard let details = decoded.result else {
            throw NSError(domain: "GooglePlacesService", code: 0, userInfo: [NSLocalizedDescriptionKey: "No details found"])
        }
        // NEW: Assign category based on type
        let types = details.types
        let category: String?
        if let t = types, t.contains(where: { $0.lowercased().contains("restaurant") }) {
            category = "food"
        } else {
            category = "attraction"
        }
        return Place(
            id: placeID,
            name: details.name,
            address: details.formatted_address,
            latitude: details.geometry.location.lat,
            longitude: details.geometry.location.lng,
            types: types,
            rating: details.rating,
            userRatingsTotal: details.user_ratings_total,
            photoReferences: details.photos?.compactMap { $0.photo_reference },
            reviews: details.reviews,
            openingHours: details.opening_hours,
            phoneNumber: details.formatted_phone_number,
            website: details.website,
            journalEntries: nil,
            category: category
        )
    }
}

enum PlacesServiceError: Error, LocalizedError {
    case invalidURL
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL for Google Places API."
        case .invalidResponse: return "Received invalid response from Google Places API."
        }
    }
}
