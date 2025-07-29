import UIKit
import FirebaseCore
import GooglePlaces

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
        FirebaseApp.configure()
        GMSPlacesClient.provideAPIKey("AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU")
        return true
    }
}
