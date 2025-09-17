import Foundation
import CoreLocation
import Combine

struct GooglePlaceSuggestion: Identifiable {
    let id = UUID()
    let name: String
    let photoURL: URL?
    let description: String?
}

class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    @Published var city: String?
    @Published var recommendationsForCity: [PersonalizedRecommendation] = []
    @Published var googleSuggestions: [GooglePlaceSuggestion] = []
    private var shouldRequestLocationWhenAuthorized = false
    private var shouldFetchGoogleSuggestionsAfterLocation = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        print("LocationManager: Initialized")
    }

    /// Call this from your view or controller to start the location flow + suggestions
    func requestLocationAndMaybeFetchSuggestions() {
        print("LocationManager: requestLocationAndMaybeFetchSuggestions called")
        let status = manager.authorizationStatus
        switch status {
        case .authorizedWhenInUse, .authorizedAlways:
            self.requestLocation()
            self.fetchGoogleSuggestions()
        case .notDetermined:
            // Set flags so after auth, we proceed
            shouldRequestLocationWhenAuthorized = true
            shouldFetchGoogleSuggestionsAfterLocation = true
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            DispatchQueue.main.async {
                self.city = "your area"
                self.fetchRecommendations(for: self.city ?? "your area")
            }
        @unknown default:
            break
        }
    }

    /// Only call this standalone if you just want location, not suggestions
    func requestLocation() {
        print("LocationManager: requestLocation called")
        let status = manager.authorizationStatus
        switch status {
        case .notDetermined:
            shouldRequestLocationWhenAuthorized = true
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        case .denied, .restricted:
            DispatchQueue.main.async {
                self.city = "your area"
                self.fetchRecommendations(for: self.city ?? "your area")
            }
        @unknown default:
            break
        }
    }

    // Only here do we request location if authorized, and only if we previously set the flag
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        print("LocationManager: Authorization status changed: \(status.rawValue)")
        if (status == .authorizedWhenInUse || status == .authorizedAlways) && shouldRequestLocationWhenAuthorized {
            shouldRequestLocationWhenAuthorized = false
            manager.requestLocation()
            if shouldFetchGoogleSuggestionsAfterLocation {
                shouldFetchGoogleSuggestionsAfterLocation = false
                // We'll call fetchGoogleSuggestions after city is set in didUpdateLocations for best results
            }
        } else if status == .denied || status == .restricted {
            shouldRequestLocationWhenAuthorized = false
            shouldFetchGoogleSuggestionsAfterLocation = false
            DispatchQueue.main.async {
                self.city = "your area"
                self.fetchRecommendations(for: self.city ?? "your area")
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        print("LocationManager: didUpdateLocations called with locations: \(locations)")
        guard let location = locations.first else { return }
        let geo = CLGeocoder()
        geo.reverseGeocodeLocation(location) { placemarks, error in
            if let error = error {
                print("LocationManager: Reverse geocode failed: \(error)")
                DispatchQueue.main.async {
                    self.city = "your area"
                    self.fetchRecommendations(for: self.city ?? "your area")
                }
                return
            }
            if let placemark = placemarks?.first, let locality = placemark.locality {
                DispatchQueue.main.async {
                    self.city = locality
                    print("LocationManager: City set to \(locality)")
                    self.fetchRecommendations(for: locality)
                    if self.shouldFetchGoogleSuggestionsAfterLocation || self.googleSuggestions.isEmpty {
                        self.shouldFetchGoogleSuggestionsAfterLocation = false
                        self.fetchGoogleSuggestions()
                    }
                }
            } else {
                DispatchQueue.main.async {
                    self.city = "your area"
                    self.fetchRecommendations(for: self.city ?? "your area")
                    if self.shouldFetchGoogleSuggestionsAfterLocation || self.googleSuggestions.isEmpty {
                        self.shouldFetchGoogleSuggestionsAfterLocation = false
                        self.fetchGoogleSuggestions()
                    }
                }
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("LocationManager: didFailWithError: \(error)")
        DispatchQueue.main.async {
            self.city = "your area"
            self.fetchRecommendations(for: self.city ?? "your area")
            if self.shouldFetchGoogleSuggestionsAfterLocation || self.googleSuggestions.isEmpty {
                self.shouldFetchGoogleSuggestionsAfterLocation = false
                self.fetchGoogleSuggestions()
            }
        }
    }

    func fetchRecommendations(for city: String) {
        print("LocationManager: fetchRecommendations called for city: \(city)")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            self.recommendationsForCity = [
                PersonalizedRecommendation(title: "Central Park", description: "Relaxing walks and events", imageName: "centralpark"),
                PersonalizedRecommendation(title: "Metropolitan Museum", description: "World's best art", imageName: "metmuseum")
            ]
            print("LocationManager: recommendationsForCity set (\(self.recommendationsForCity.count) items)")
        }
    }

    func fetchGoogleSuggestions() {
        print("LocationManager: fetchGoogleSuggestions called")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            self.googleSuggestions = [
                GooglePlaceSuggestion(
                    name: "Eiffel Tower",
                    photoURL: URL(string: "https://images.unsplash.com/photo-1464983953574-0892a716854b"),
                    description: "The most iconic symbol of Paris, France."
                ),
                GooglePlaceSuggestion(
                    name: "Great Wall of China",
                    photoURL: URL(string: "https://images.unsplash.com/photo-1506744038136-46273834b3fb"),
                    description: "A world wonder stretching thousands of miles in northern China."
                ),
                GooglePlaceSuggestion(
                    name: "Colosseum",
                    photoURL: URL(string: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee"),
                    description: "Ancient Roman gladiatorial arena in the heart of Rome."
                )
            ]
            print("LocationManager: googleSuggestions set (\(self.googleSuggestions.count) items)")
        }
    }
}
