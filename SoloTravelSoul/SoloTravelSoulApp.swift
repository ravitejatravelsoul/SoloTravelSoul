import SwiftUI

@main
struct SoloTravelSoulApp: App {
    @StateObject private var tripViewModel = TripViewModel()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(tripViewModel)
        }
    }
}
