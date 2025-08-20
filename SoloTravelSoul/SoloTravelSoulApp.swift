import SwiftUI

@main
struct SoloTravelSoulApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject var authViewModel = AuthViewModel()
    @StateObject var tripViewModel = TripViewModel()
    @StateObject var notificationsVM = NotificationsViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authViewModel)
                .environmentObject(tripViewModel)
                .environmentObject(notificationsVM)
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
