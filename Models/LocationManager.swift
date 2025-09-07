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

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        print("LocationManager: Initialized")
    }

    func requestLocation() {
        print("LocationManager: requestLocation called")
        manager.requestWhenInUseAuthorization()
        manager.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        print("LocationManager: didUpdateLocations called with locations: \(locations)")
        guard let location = locations.first else { return }
        let geo = CLGeocoder()
        geo.reverseGeocodeLocation(location) { placemarks, error in
            if let placemark = placemarks?.first {
                self.city = placemark.locality ?? "your area"
                print("LocationManager: City set to \(self.city!)")
                self.fetchRecommendations(for: self.city!)
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("LocationManager: didFailWithError: \(error)")
        self.city = "your area"
        self.fetchRecommendations(for: self.city!)
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
