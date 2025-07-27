import SwiftUI

struct RootTabView: View {
    @StateObject var tripViewModel = TripViewModel()
    @State private var selectedTab = 0
    @State private var editTripID: UUID? = nil

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(selectedTab: $selectedTab, editTripID: $editTripID)
                .environmentObject(tripViewModel)
                .tabItem { Label("Home", systemImage: "house") }
                .tag(0)

            TripsTabView(editTripID: $editTripID)
                .environmentObject(tripViewModel)
                .tabItem { Label("Trips", systemImage: "airplane") }
                .tag(1)

            DiscoverView(tripViewModel: tripViewModel)
                .environmentObject(tripViewModel)
                .tabItem { Label("Discover", systemImage: "magnifyingglass") }
                .tag(2)

            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
                .tag(3)
        }
    }
}
