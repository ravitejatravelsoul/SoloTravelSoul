import SwiftUI

@main
struct SoloTravelSoulApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject var authViewModel = AuthViewModel()
    @StateObject var tripViewModel = TripViewModel()
    @StateObject var notificationsVM = NotificationsViewModel()
    @StateObject var locationManager = LocationManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .accentColor(AppTheme.primary)
                .environmentObject(authViewModel)
                .environmentObject(tripViewModel)
                .environmentObject(notificationsVM)
                .environmentObject(locationManager)
                .onAppear {
                    if let user = authViewModel.user {
                        notificationsVM.setup(userId: user.uid)
                    }
                }
                .onChange(of: authViewModel.user) {
                    if let user = authViewModel.user {
                        notificationsVM.setup(userId: user.uid)
                    }
                }
        }
    }
}
