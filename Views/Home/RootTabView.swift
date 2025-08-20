import SwiftUI

struct RootTabView: View {
    @StateObject var tripViewModel = TripViewModel()
    @StateObject var groupViewModel = GroupViewModel()
    @EnvironmentObject var authViewModel: AuthViewModel
    @EnvironmentObject var notificationsVM: NotificationsViewModel

    @AppStorage("profileImageData") var profileImageData: Data = Data()

    @State private var selectedTab = 0
    @State private var editTripID: UUID? = nil
    @State private var showDrawer = false
    @State private var drawerDestination: DrawerDestination? = nil
    @State private var showProfileSheet = false

    enum DrawerDestination: Identifiable {
        case notifications
        case approvals
        case chats

        var id: Int {
            switch self {
            case .notifications: return 1
            case .approvals: return 2
            case .chats: return 3
            }
        }
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            TabView(selection: $selectedTab) {
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
                    ProgressView("Loading profile...")
                        .tabItem { Label("Home", systemImage: "house") }
                        .tag(0)
                }
            }
            // Only burger menu icon at top left now, hide if a sheet/drawer is open!
            .overlay(alignment: .topLeading) {
                if let _ = authViewModel.currentUserProfile,
                   drawerDestination == nil,
                   !showProfileSheet,
                   !showDrawer {
                    Button(action: { withAnimation { showDrawer = true } }) {
                        Image(systemName: "line.horizontal.3")
                            .imageScale(.large)
                            .padding(10)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    .padding(.top, 12)
                    .padding(.leading, 12)
                }
            }
            // Animated Drawer
            if showDrawer, let userProfile = authViewModel.currentUserProfile {
                AnimatedDrawer(
                    user: userProfile,
                    profileImageData: profileImageData,
                    onClose: { withAnimation { showDrawer = false } },
                    onSelectNotifications: {
                        drawerDestination = .notifications
                        showDrawer = false
                    },
                    onSelectApprovals: {
                        drawerDestination = .approvals
                        showDrawer = false
                    },
                    onSelectChats: {
                        drawerDestination = .chats
                        showDrawer = false
                    },
                    onSelectProfile: {
                        showProfileSheet = true
                        showDrawer = false
                    },
                    onLogout: {
                        authViewModel.signOut()
                        showDrawer = false
                    }
                )
                .transition(.move(edge: .leading))
                .zIndex(2)
            }
        }
        // Present destinations as sheets
        .sheet(item: $drawerDestination) { destination in
            switch destination {
            case .notifications:
                NotificationsListView(notifications: notificationsVM.notifications)
            case .approvals:
                ApprovalsListView(approvals: [])
            case .chats:
                GroupChatsListView(
                    groups: [],
                    menuOnRight: true,
                    onMenu: { withAnimation { showDrawer = true } }
                )
            }
        }
        .sheet(isPresented: $showProfileSheet) {
            ProfileView()
        }
    }
}
