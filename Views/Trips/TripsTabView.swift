import SwiftUI
import CoreLocation
import FirebaseAuth

struct TripsTabView: View {
    @EnvironmentObject var tripViewModel: TripViewModel
    @EnvironmentObject var locationManager: LocationManager
    @EnvironmentObject var appState: AppState // <-- Add this for notification badge

    @Binding var editTripID: UUID?
    @Binding var showNotifications: Bool // <-- Add this for notification handling

    struct SheetTrip: Identifiable {
        let id: UUID
    }
    @State private var sheetTrip: SheetTrip? = nil
    @State private var showCreateTrip = false

    private var currentUserId: String? {
        Auth.auth().currentUser?.uid
    }
    var today: Date {
        Calendar.current.startOfDay(for: Date())
    }
    var myTrips: [PlannedTrip] {
        guard let uid = currentUserId else { return [] }
        return tripViewModel.trips.filter { $0.members.contains(uid) }
    }
    var upcomingTrips: [PlannedTrip] {
        myTrips.filter { $0.startDate >= today }.sorted { $0.startDate < $1.startDate }
    }
    var pastTrips: [PlannedTrip] {
        myTrips.filter { $0.endDate < today }.sorted { $0.startDate > $1.startDate }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    headerSection
                    upcomingSection
                    pastSection
                    if upcomingTrips.isEmpty && pastTrips.isEmpty {
                        suggestionsSection
                    }
                    Spacer(minLength: 24)
                }
            }
            .background(AppTheme.background.ignoresSafeArea())
            .sheet(item: $sheetTrip) { sheet in
                if let trip = tripViewModel.trips.first(where: { $0.id == sheet.id }) {
                    TripDetailView(tripViewModel: tripViewModel, trip: trip)
                } else {
                    VStack {
                        Text("Trip not found or already deleted.")
                        Button("Close") { sheetTrip = nil }
                    }
                }
            }
            .sheet(isPresented: $showCreateTrip) {
                CreateTripView()
                    .environmentObject(tripViewModel)
            }
            .onAppear {
                if tripViewModel.trips.isEmpty {
                    tripViewModel.loadTrips()
                }
                if locationManager.googleSuggestions.isEmpty {
                    locationManager.requestLocation()
                    locationManager.fetchGoogleSuggestions()
                }
            }
            .onChange(of: editTripID) { _, newValue in
                if let id = newValue {
                    sheetTrip = SheetTrip(id: id)
                    editTripID = nil
                }
            }
            .toolbar {
                ToolbarItemGroup(placement: .navigationBarTrailing) {
                    Button(action: { showCreateTrip = true }) {
                        Image(systemName: "plus.circle.fill")
                            .font(.title)
                            .foregroundColor(AppTheme.primary)
                    }
                    .accessibilityLabel("Add Trip")
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
        }
    }

    // MARK: - Subviews

    private var headerSection: some View {
        HStack {
            Spacer()
            Text("My Trips")
                .font(.largeTitle.bold())
                .foregroundColor(.primary)
                .frame(maxWidth: .infinity, alignment: .center)
            Spacer()
            // Plus icon moved to toolbar for unified logic
        }
        .padding(.horizontal)
        .padding(.top, 24)
    }

    private var upcomingSection: some View {
        Group {
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
                                onView: { sheetTrip = SheetTrip(id: trip.id) },
                                onEdit: { sheetTrip = SheetTrip(id: trip.id) },
                                onDelete: { tripViewModel.deleteTrip(trip) }
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
        }
    }

    private var pastSection: some View {
        Group {
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
                                onEdit: { sheetTrip = SheetTrip(id: trip.id) }
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
        }
    }

    @ViewBuilder
    private var suggestionsSection: some View {
        if !locationManager.googleSuggestions.isEmpty {
            GoogleSuggestionsView(
                suggestions: locationManager.googleSuggestions,
                onAdd: { _ in showCreateTrip = true }
            )
        } else if let city = locationManager.city {
            PersonalizedRecommendationsView(
                city: city,
                recommendations: locationManager.recommendationsForCity,
                onAdd: { _ in showCreateTrip = true }
            )
        } else {
            ProgressView("Loading suggestions...")
                .frame(height: 250)
        }
    }
}
