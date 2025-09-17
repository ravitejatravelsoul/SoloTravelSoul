import SwiftUI

struct HomeView: View {
    @EnvironmentObject var tripViewModel: TripViewModel

    // Props for cross-tab editing
    @Binding var selectedTab: Int
    @Binding var editTripID: UUID?

    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile

    @Binding var showNotifications: Bool
    @EnvironmentObject var appState: AppState

    @State private var showAddTrip = false
    @State private var showDiscover = false
    @State private var showItinerary = false
    @State private var showJournal = false

    let inspirations = ["travel2", "travel3", "Bali"]
    let latestJournal = "Had a great time at the Golden Gate Bridge!"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // --- Modern UI Header ---
                    VStack(spacing: 16) {
                        // Centered App Title
                        Text("Solo Travel Soul")
                            .font(.headline)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.top, 18)

                        // Greeting & Avatar Row
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Hi \(currentUser.firstName ?? currentUser.name.components(separatedBy: " ").first ?? ""),")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                Text("Travelling Today?")
                                    .font(.title.bold())
                                    .foregroundColor(.primary)
                            }
                            Spacer()
                            if let photoURL = currentUser.photoURL, !photoURL.isEmpty, let url = URL(string: photoURL) {
                                AsyncImage(url: url) { phase in
                                    if let image = phase.image {
                                        image.resizable().scaledToFill()
                                    } else {
                                        Circle().fill(Color.blue)
                                    }
                                }
                                .frame(width: 44, height: 44)
                                .clipShape(Circle())
                            } else {
                                Circle()
                                    .fill(Color.blue)
                                    .frame(width: 44, height: 44)
                                    .overlay(
                                        Text(currentUser.initials)
                                            .font(.headline)
                                            .foregroundColor(.white)
                                    )
                            }
                        }
                        // Search Bar below greeting
                        HStack {
                            Image(systemName: "magnifyingglass")
                                .foregroundColor(.secondary)
                            Text("Search trip, place or group...")
                                .font(.body)
                                .foregroundColor(.secondary)
                            Spacer()
                        }
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(16)
                        .shadow(color: .black.opacity(0.04), radius: 2, x: 0, y: 1)
                    }
                    .padding(.horizontal)

                    // Next Trip Card
                    if let nextTrip = tripViewModel.trips.first {
                        NextTripOverviewCard(
                            trip: nextTrip,
                            onEdit: {
                                // Cross-tab: open edit in Trips tab
                                editTripID = nextTrip.id
                                selectedTab = 1
                            }
                        )
                    }

                    // Quick Actions
                    QuickActionsView(actions: [
                        QuickAction(title: "Add Trip", icon: "plus.circle.fill", action: { showAddTrip = true }),
                        QuickAction(title: "Discover", icon: "globe.europe.africa.fill", action: { showDiscover = true }),
                        QuickAction(title: "Itinerary", icon: "list.bullet", action: { showItinerary = true }),
                        QuickAction(title: "Journal", icon: "book.closed.fill", action: { showJournal = true })
                    ])

                    // Recent Trips
                    RecentTripsView(
                        trips: tripViewModel.trips,
                        onEditTrip: { trip in
                            // Cross-tab: open edit in Trips tab
                            editTripID = trip.id
                            selectedTab = 1
                        }
                    )

                    // Journal Preview & Inspiration
                    TravelJournalPreview(latestEntry: latestJournal)
                    DiscoverInspirationView(inspirations: inspirations)

                    Spacer(minLength: 20)
                }
                .padding(.horizontal)
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showNotifications = true
                    } label: {
                        ZStack {
                            Image(systemName: "bell")
                                .imageScale(.large)
                            if appState.unreadNotificationCount > 0 {
                                Circle()
                                    .fill(Color.red)
                                    .frame(width: 10, height: 10)
                                    .offset(x: 8, y: -8)
                            }
                        }
                    }
                }
            }
            .sheet(isPresented: $showAddTrip) {
                AddTripView { newTrip in
                    tripViewModel.addTrip(newTrip)
                }
            }
            .sheet(isPresented: $showDiscover) {
                // Restored: Pass planned dependencies to DiscoverView
                DiscoverView(
                    groupViewModel: groupViewModel,
                    currentUser: currentUser,
                    showNotifications: $showNotifications
                )
                .environmentObject(tripViewModel)
            }
            .sheet(isPresented: $showItinerary) {
                ItineraryView(trips: tripViewModel.trips)
            }
            .sheet(isPresented: $showJournal) {
                JournalView(latestEntry: latestJournal)
            }
        }
    }
}
