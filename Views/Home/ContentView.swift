import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            AuthHomeView()
                .tabItem {
                    Label("Home", systemImage: "house")
                }
            UpcomingTripsView()
                .tabItem {
                    Label("Trips", systemImage: "airplane")
                }
            DiscoverView()
                .tabItem {
                    Label("Discover", systemImage: "magnifyingglass")
                }
            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.crop.circle")
                }
        }
    }
}
