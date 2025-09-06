import SwiftUI
import CoreLocation
import FirebaseAuth

struct TripsTabView: View {
    @EnvironmentObject var tripViewModel: TripViewModel
    @ObservedObject var locationManager = LocationManager()
    @Binding var editTripID: UUID?

    struct SheetTrip: Identifiable {
        let id: UUID
    }
    @State private var sheetTrip: SheetTrip? = nil
    @State private var showCreateTrip = false

    // Only show trips where the user is a member (by uid)
    private var currentUserId: String? {
        let uid = Auth.auth().currentUser?.uid
        print("TripsTabView: currentUserId = \(uid ?? "nil")")
        return uid
    }
    var today: Date {
        let today = Calendar.current.startOfDay(for: Date())
        print("TripsTabView: today's date = \(today)")
        return today
    }

    // Filter only user's trips
    var myTrips: [PlannedTrip] {
        guard let uid = currentUserId else {
            print("TripsTabView: No currentUserId")
            return []
        }
        print("TripsTabView: All trips from viewModel = \(tripViewModel.trips)")
        let mine = tripViewModel.trips.filter { $0.members.contains(uid) }
        print("TripsTabView: myTrips = \(mine.map { "\($0.destination) [\($0.id)] members:\($0.members)" })")
        return mine
    }
    var upcomingTrips: [PlannedTrip] {
        let upcoming = myTrips.filter { $0.startDate >= today }.sorted { $0.startDate < $1.startDate }
        print("TripsTabView: upcomingTrips = \(upcoming.map { "\($0.destination) [\($0.id)]" })")
        return upcoming
    }
    var pastTrips: [PlannedTrip] {
        let past = myTrips.filter { $0.endDate < today }.sorted { $0.startDate > $1.startDate }
        print("TripsTabView: pastTrips = \(past.map { "\($0.destination) [\($0.id)]" })")
        return past
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    // Centered Header
                    HStack {
                        Spacer()
                        Text("My Trips")
                            .font(.largeTitle.bold())
                            .foregroundColor(.primary)
                            .frame(maxWidth: .infinity, alignment: .center)
                        Spacer()
                        Button(action: {
                            print("TripsTabView: Add Trip button tapped")
                            showCreateTrip = true
                        }) {
                            Image(systemName: "plus.circle.fill")
                                .font(.title)
                                .foregroundColor(AppTheme.primary)
                        }
                        .accessibilityLabel("Add Trip")
                    }
                    .padding(.horizontal)
                    .padding(.top, 24)

                    // --- UPCOMING TRIPS SECTION HEADING ---
                    Text("Upcoming Trips")
                        .font(.title2.bold())
                        .foregroundColor(.primary)
                        .padding(.leading, 20)
                        .padding(.top, 16)
                        .padding(.bottom, 4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.systemBackground).opacity(0.98))

                    if !upcomingTrips.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 18) {
                                ForEach(upcomingTrips) { trip in
                                    PlannedTripMainCardView(
                                        trip: trip,
                                        onView: {
                                            print("TripsTabView: Viewing trip with id \(trip.id)")
                                            sheetTrip = SheetTrip(id: trip.id)
                                        },
                                        onEdit: {
                                            print("TripsTabView: Editing trip with id \(trip.id)")
                                            sheetTrip = SheetTrip(id: trip.id)
                                        },
                                        onDelete: {
                                            print("TripsTabView: Deleting trip with id \(trip.id)")
                                            tripViewModel.deleteTrip(trip)
                                        }
                                    )
                                }
                            }
                            .padding(.horizontal)
                            .padding(.vertical, 8)
                        }
                    } else {
                        Text("No upcoming trips. Start planning your next adventure!")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .padding(.leading, 20)
                            .padding(.top, 6)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    // --- PAST TRIPS SECTION HEADING ---
                    Text("Past Trips")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(.primary)
                        .padding(.leading, 20)
                        .padding(.top, 24)
                        .padding(.bottom, 4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.systemBackground).opacity(0.98))

                    if !pastTrips.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 14) {
                                ForEach(pastTrips) { trip in
                                    PlannedTripCardView(
                                        trip: trip,
                                        onEdit: {
                                            print("TripsTabView: Editing past trip with id \(trip.id)")
                                            sheetTrip = SheetTrip(id: trip.id)
                                        }
                                    )
                                }
                            }
                            .padding(.horizontal)
                        }
                    } else {
                        Text("No past trips yet.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .padding(.leading, 20)
                            .padding(.top, 6)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    // --- SUGGESTIONS OR GOOGLE PLACE RECOMMENDATIONS ---
                    if upcomingTrips.isEmpty && pastTrips.isEmpty {
                        print("TripsTabView: No trips found, showing suggestions")
                        if !locationManager.googleSuggestions.isEmpty {
                            GoogleSuggestionsView(
                                suggestions: locationManager.googleSuggestions,
                                onAdd: { suggestion in
                                    print("TripsTabView: Google suggestion tapped: \(suggestion.name)")
                                    showCreateTrip = true
                                }
                            )
                        } else if let city = locationManager.city {
                            PersonalizedRecommendationsView(
                                city: city,
                                recommendations: locationManager.recommendationsForCity,
                                onAdd: { _ in
                                    print("TripsTabView: Personalized recommendation tapped for city \(city)")
                                    showCreateTrip = true
                                }
                            )
                        } else {
                            ProgressView("Loading suggestions...")
                                .frame(height: 250)
                        }
                    }

                    Spacer(minLength: 24)
                }
            }
            .background(AppTheme.background.ignoresSafeArea())
            .sheet(item: $sheetTrip) { sheet in
                if let trip = tripViewModel.trips.first(where: { $0.id == sheet.id }) {
                    print("TripsTabView: Opening TripDetailView for trip id \(sheet.id)")
                    TripDetailView(tripViewModel: tripViewModel, trip: trip)
                } else {
                    VStack {
                        Text("Trip not found or already deleted.")
                        Button("Close") { sheetTrip = nil }
                    }
                }
            }
            .sheet(isPresented: $showCreateTrip) {
                print("TripsTabView: Presenting CreateTripView")
                CreateTripView()
                    .environmentObject(tripViewModel)
            }
            .onAppear {
                print("TripsTabView: onAppear called")
                tripViewModel.loadTrips()
                locationManager.requestLocation()
                if tripViewModel.trips.isEmpty {
                    print("TripsTabView: No trips yet, fetching Google suggestions")
                    locationManager.fetchGoogleSuggestions()
                }
            }
            .onChange(of: editTripID) { oldValue, newValue in
                print("TripsTabView: editTripID changed from \(String(describing: oldValue)) to \(String(describing: newValue))")
                if let id = newValue {
                    sheetTrip = SheetTrip(id: id)
                    editTripID = nil
                }
            }
        }
    }
}
