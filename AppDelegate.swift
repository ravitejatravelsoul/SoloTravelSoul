import UIKit
import FirebaseCore
import FirebaseAuth
import FirebaseFirestore
import GooglePlaces
import FirebaseMessaging
import UserNotifications

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
        FirebaseApp.configure()
        GMSPlacesClient.provideAPIKey("AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU")
        
        // Register for notifications
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            print("Push notification permission granted: \(granted)")
        }
        application.registerForRemoteNotifications()
        
        // FCM Messaging delegate
        Messaging.messaging().delegate = self
        
        // Print FCM token if it's already available
        Messaging.messaging().token { token, error in
            if let error = error {
                print("Error fetching FCM registration token: \(error)")
            } else if let token = token {
                print("FCM registration token (initial fetch): \(token)")
            }
        }
        
        return true
    }
    
    // Called when APNS device token is received
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        print("APNS device token set: \(deviceToken.map { String(format: "%02.2hhx", $0) }.joined())")
    }

    // Called if registration for remote notifications fails
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Failed to register for remote notifications: \(error.localizedDescription)")
    }
    
    // Called when FCM token is updated or received
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        print("FCM registration token (didReceiveRegistrationToken): \(fcmToken ?? "nil")")
        // Save this token to Firestore under the current user
        if let uid = Auth.auth().currentUser?.uid, let token = fcmToken {
            let db = Firestore.firestore()
            db.collection("users").document(uid).setData(["fcmToken": token], merge: true) { error in
                if let error = error {
                    print("Error saving FCM token to Firestore: \(error)")
                } else {
                    print("FCM token updated in Firestore: \(token)")
                }
            }
        } else {
            print("No current user or FCM token, not saving to Firestore.")
        }
    }
    
    // Show notification banner when app is in foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge, .list])
    }
}
