import SwiftUI

struct RootTabView: View {
    @StateObject var tripViewModel = TripViewModel()
    @StateObject var groupViewModel = GroupViewModel()
    @EnvironmentObject var authViewModel: AuthViewModel

    @State private var selectedTab = 0
    @State private var editTripID: UUID? = nil

    var body: some View {
        TabView(selection: $selectedTab) {
            // Show tabs only after profile is loaded
            if let userProfile = authViewModel.currentUserProfile {
                HomeView(
                    selectedTab: $selectedTab,
                    editTripID: $editTripID,
                    groupViewModel: groupViewModel,
                    currentUser: userProfile
                )
                .environmentObject(tripViewModel)
                .tabItem { Label("Home", systemImage: "house") }
                .tag(0)

                TripsTabView(editTripID: $editTripID)
                    .environmentObject(tripViewModel)
                    .tabItem { Label("Trips", systemImage: "airplane") }
                    .tag(1)

                DiscoverView(
                    tripViewModel: tripViewModel,
                    groupViewModel: groupViewModel,
                    currentUser: userProfile
                )
                .environmentObject(tripViewModel)
                .tabItem { Label("Discover", systemImage: "magnifyingglass") }
                .tag(2)

                GroupListView(
                    groupViewModel: groupViewModel,
                    currentUser: userProfile
                )
                .tabItem { Label("Groups", systemImage: "person.3.fill") }
                .tag(3)
            } else {
                // Fallback while loading or if not authenticated
                ProgressView("Loading profile...")
                    .tabItem { Label("Home", systemImage: "house") }
                    .tag(0)
            }

            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
                .tag(4)
        }
    }
}
