import SwiftUI
import CoreLocation

struct TripsTabView: View {
    @EnvironmentObject var tripViewModel: TripViewModel
    @ObservedObject var locationManager = LocationManager()
    @Binding var editTripID: UUID?

    struct SheetTrip: Identifiable {
        let id: UUID
    }
    @State private var sheetTrip: SheetTrip? = nil
    @State private var showCreateTrip = false

    var today: Date { Calendar.current.startOfDay(for: Date()) }
    var upcomingTrips: [PlannedTrip] {
        tripViewModel.trips.filter { $0.startDate >= today }
    }
    var pastTrips: [PlannedTrip] {
        tripViewModel.trips.filter { $0.endDate < today }
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
                        Button(action: { showCreateTrip = true }) {
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

                    // --- SUGGESTIONS OR GOOGLE PLACE RECOMMENDATIONS ---
                    if upcomingTrips.isEmpty && pastTrips.isEmpty {
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
                tripViewModel.loadTrips()
                locationManager.requestLocation()
                if tripViewModel.trips.isEmpty {
                    locationManager.fetchGoogleSuggestions()
                }
            }
            .onChange(of: editTripID) { _, new in
                if let id = new {
                    sheetTrip = SheetTrip(id: id)
                    editTripID = nil
                }
            }
        }
    }
}

// --- Google Suggestions Widget ---
struct GooglePlaceSuggestion: Identifiable {
    let id = UUID()
    let name: String
    let photoURL: URL?
    let description: String?
}

struct GoogleSuggestionsView: View {
    let suggestions: [GooglePlaceSuggestion]
    let onAdd: (GooglePlaceSuggestion) -> Void

    var body: some View {
        TabView {
            ForEach(suggestions) { suggestion in
                VStack(spacing: 16) {
                    if let url = suggestion.photoURL {
                        AsyncImage(url: url) { image in
                            image.resizable()
                                .scaledToFill()
                        } placeholder: {
                            Color.gray.opacity(0.2)
                        }
                        .frame(height: 260)
                        .clipped()
                        .cornerRadius(18)
                    }
                    Text(suggestion.name)
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                    if let desc = suggestion.description {
                        Text(desc)
                            .font(.body)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                    Button("Add to Trip") {
                        onAdd(suggestion)
                    }
                    .font(.headline)
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 8)
                }
                .padding(.vertical, 32)
                .padding(.horizontal)
            }
        }
        .tabViewStyle(.page)
        .frame(height: 430)
    }
}

// --- Suggestions View (Legacy, fallback) ---
struct DestinationSuggestion: Identifiable {
    let id = UUID()
    let title: String
    let imageName: String
}

struct SuggestionsView: View {
    let suggestions: [DestinationSuggestion]
    let onAdd: () -> Void

    var body: some View {
        VStack(spacing: 22) {
            Text("Top Destinations")
                .font(.headline)
                .foregroundColor(.primary)
                .padding(.top, 24)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 20) {
                    ForEach(suggestions) { suggestion in
                        VStack(spacing: 10) {
                            Image(suggestion.imageName)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 120, height: 80)
                                .clipped()
                                .cornerRadius(14)
                            Text(suggestion.title)
                                .font(.subheadline.bold())
                                .foregroundColor(.primary)
                            Button("Add to Trip") {
                                onAdd()
                            }
                            .font(.caption)
                            .buttonStyle(.borderedProminent)
                        }
                        .frame(width: 130)
                    }
                }
                .padding(.horizontal)
            }
        }
    }
}

// --- Empty State (optional, could be replaced by SuggestionsView) ---
struct EmptyTripsView: View {
    let onAdd: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "airplane.departure")
                .font(.system(size: 44))
                .foregroundColor(AppTheme.primary)
            Text("No planned trips yet!")
                .font(.title2)
                .foregroundColor(.secondary)
            Button(action: onAdd) {
                Label("Add Your First Trip", systemImage: "plus.circle.fill")
            }
            .font(.headline)
            .foregroundColor(.white)
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(AppTheme.primary)
            .cornerRadius(10)
        }
        .padding(.vertical, 48)
        .frame(maxWidth: .infinity)
    }
}
