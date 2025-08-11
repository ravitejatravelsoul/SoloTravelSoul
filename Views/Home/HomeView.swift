import SwiftUI

struct HomeView: View {
    @EnvironmentObject var tripViewModel: TripViewModel

    // Props for cross-tab editing
    @Binding var selectedTab: Int
    @Binding var editTripID: UUID?

    // Add these properties:
    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile

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
            .navigationTitle("Solo Travel Soul")
            .sheet(isPresented: $showAddTrip) {
                AddTripView { newTrip in
                    tripViewModel.addTrip(newTrip)
                }
            }
            .sheet(isPresented: $showDiscover) {
                // Pass groupViewModel and currentUser here!
                DiscoverView(
                    tripViewModel: tripViewModel,
                    groupViewModel: groupViewModel,
                    currentUser: currentUser
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
