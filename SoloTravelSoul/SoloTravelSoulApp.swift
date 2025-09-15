import SwiftUI

@main
struct SoloTravelSoulApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject var authViewModel = AuthViewModel()
    @StateObject var tripViewModel = TripViewModel()
    @StateObject var notificationsVM = NotificationsViewModel()
    @StateObject var locationManager = LocationManager()
    @StateObject var appState = AppState() // NEW

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authViewModel)
                .environmentObject(tripViewModel)
                .environmentObject(notificationsVM)
                .environmentObject(locationManager)
                .environmentObject(appState) // NEW
                .onAppear {
                    if let user = authViewModel.user {
                        notificationsVM.setup(userId: user.uid, appState: appState)
                    }
                }
                .onChange(of: authViewModel.user) {
                    if let user = authViewModel.user {
                        notificationsVM.setup(userId: user.uid, appState: appState)
                    }
                }
        }
    }
}
