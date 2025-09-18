import Foundation
import CoreLocation
import Combine

final class DiscoverLocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined
    @Published var userLocation: CLLocation?
    private let manager = CLLocationManager()
    private var didRequest = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    /// Call this to request permission. All logic continues in the delegate.
    func requestAuthorizationAndMaybeStartUpdating() {
        guard CLLocationManager.locationServicesEnabled() else { return }
        didRequest = true
        manager.requestWhenInUseAuthorization() // no status check here!
    }

    /// Call this if you want to force location updates (after permission is granted)
    func startUpdating() {
        guard authorizationStatus == .authorizedWhenInUse || authorizationStatus == .authorizedAlways else { return }
        manager.startUpdatingLocation()
    }
    func stopUpdating() { manager.stopUpdatingLocation() }

    // This is CALLED by the system whenever authorization changes, including after request
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let newStatus = manager.authorizationStatus
        DispatchQueue.main.async {
            self.authorizationStatus = newStatus
            if self.didRequest,
               (newStatus == .authorizedWhenInUse || newStatus == .authorizedAlways) {
                self.startUpdating()
                self.didRequest = false
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        DispatchQueue.main.async {
            self.userLocation = locations.last
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Location error: \(error.localizedDescription)")
    }
}
