import Foundation
import CoreLocation
import Combine
import MapKit

final class DiscoverLocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined
    @Published var userLocation: CLLocation?
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func requestAuthorizationAndMaybeStartUpdating() {
        guard CLLocationManager.locationServicesEnabled() else { return }
        manager.requestWhenInUseAuthorization()
    }

    func startUpdating() {
        // Only start updates if authorized, else just request authorization
        guard authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways else {
            manager.requestWhenInUseAuthorization()
            return
        }
        manager.startUpdatingLocation()
    }

    func stopUpdating() { manager.stopUpdatingLocation() }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        DispatchQueue.main.async {
            self.authorizationStatus = manager.authorizationStatus
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                manager.startUpdatingLocation()
            default:
                break
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        DispatchQueue.main.async {
            self.userLocation = locations.last
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Location error: \(error)")
    }
}

// MARK: - Notification
extension Notification.Name {
    static let didUpdateUserLocation = Notification.Name("didUpdateUserLocation")
}
