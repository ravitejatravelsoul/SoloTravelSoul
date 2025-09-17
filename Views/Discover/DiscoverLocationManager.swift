import Foundation
import CoreLocation
import Combine

final class DiscoverLocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined
    @Published var userLocation: CLLocation?
    private let manager = CLLocationManager()
    private var shouldStartUpdatingAfterAuth = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    /// Use this instead of requestAuthorization and startUpdating
    func requestAuthorizationAndMaybeStartUpdating() {
        if CLLocationManager.locationServicesEnabled() {
            let status = manager.authorizationStatus
            if status == .notDetermined {
                shouldStartUpdatingAfterAuth = true
                manager.requestWhenInUseAuthorization()
                // Do NOT call startUpdating here!
            } else if status == .authorizedAlways || status == .authorizedWhenInUse {
                startUpdating()
            }
        }
    }

    func startUpdating() {
        if authorizationStatus == .authorizedAlways || authorizationStatus == .authorizedWhenInUse {
            manager.startUpdatingLocation()
        }
    }
    func stopUpdating() { manager.stopUpdatingLocation() }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationStatus = manager.authorizationStatus
        if shouldStartUpdatingAfterAuth && (authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways) {
            shouldStartUpdatingAfterAuth = false
            startUpdating()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        userLocation = loc
    }
}
