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
    let reviews: [PlaceReview]? // <- Use your model directly!
    let opening_hours: PlaceOpeningHours? // <- Use your model directly!
    let formatted_phone_number: String?
    let website: String?
}
private struct PlaceGeometry: Codable { let location: PlaceLocation }
private struct PlaceLocation: Codable { let lat: Double; let lng: Double }
private struct PlacePhoto: Codable { let photo_reference: String }

final class GooglePlacesService {
    static let shared = GooglePlacesService()
    private init() {}

    private let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU"

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
                website: nil
            )
            places.append(place)
        }
        return places
    }

    func fetchTopPlaces(for locationName: String) async throws -> [Place] {
        let query = "top attractions in \(locationName)"
        return try await searchPlaces(query: query, locationBias: nil, pageSize: 15)
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
        return Place(
            id: placeID,
            name: details.name,
            address: details.formatted_address,
            latitude: details.geometry.location.lat,
            longitude: details.geometry.location.lng,
            types: details.types,
            rating: details.rating,
            userRatingsTotal: details.user_ratings_total,
            photoReferences: details.photos?.compactMap { $0.photo_reference },
            reviews: details.reviews,
            openingHours: details.opening_hours,
            phoneNumber: details.formatted_phone_number,
            website: details.website
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
