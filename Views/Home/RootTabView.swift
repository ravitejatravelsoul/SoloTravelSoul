import SwiftUI

struct RootTabView: View {
    @StateObject var tripViewModel = TripViewModel()
    @StateObject var groupViewModel = GroupViewModel()
    @EnvironmentObject var authViewModel: AuthViewModel
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

            if let userProfile = authViewModel.currentUserProfile {
                GroupListView(groupViewModel: groupViewModel, currentUser: userProfile)
                    .tabItem { Label("Groups", systemImage: "person.3.fill") }
                    .tag(3)
            }

            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
                .tag(4)
        }
    }
}
