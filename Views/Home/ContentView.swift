import SwiftUI

struct ContentView: View {
    @AppStorage("isLoggedIn") private var isLoggedIn = false

    var body: some View {
        if isLoggedIn {
            TabView {
                HomeView()
                    .tabItem { Label("Home", systemImage: "house") }
                UpcomingTripsView()
                    .tabItem { Label("Trips", systemImage: "airplane") }
                DiscoverView()
                    .tabItem { Label("Discover", systemImage: "magnifyingglass") }
                ProfileView()
                    .tabItem { Label("Profile", systemImage: "person.crop.circle") }
            }
        } else {
            AuthHomeView()
        }
    }
}
