import SwiftUI
import MapKit

struct DiscoverView: View {
    @EnvironmentObject var tripViewModel: TripViewModel
    @ObservedObject var searchViewModel: PlaceSearchViewModel
    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile

    @State private var selectedPlace: Place? = nil
    @State private var loadingDetail: Bool = false
    @State private var detailError: String? = nil

    let gridColumns: [GridItem] = [GridItem(.flexible()), GridItem(.flexible())]

    // Region and activity filters
    @State private var selectedRegion: String = "Paris"
    @State private var selectedActivity: String = "All"
    let regions = ["Paris", "London", "New York", "Tokyo", "Rome", "Sydney"]
    let suggestedActivities = ["All", "Restaurant", "Beach", "Museum", "Hiking", "Park", "Shopping", "Nightlife", "Cafe"]

    init(tripViewModel: TripViewModel, groupViewModel: GroupViewModel, currentUser: UserProfile) {
        self._searchViewModel = ObservedObject(wrappedValue: PlaceSearchViewModel(tripViewModel: tripViewModel))
        self._groupViewModel = ObservedObject(wrappedValue: groupViewModel)
        self.currentUser = currentUser
    }

    private func handlePlaceTap(place: Place) {
        loadingDetail = true
        detailError = nil
        searchViewModel.fetchPlaceDetails(placeID: place.id) { detailedPlace, error in
            DispatchQueue.main.async {
                loadingDetail = false
                if let detailedPlace = detailedPlace {
                    self.selectedPlace = detailedPlace
                } else {
                    self.detailError = error ?? "Failed to load details"
                }
            }
        }
    }

    // --- Region/City Filter Bar ---
    var regionFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(regions, id: \.self) { region in
                    Button(action: {
                        selectedRegion = region
                        Task {
                            await searchViewModel.fetchTopPlaces(for: "tourist attractions in \(region)")
                        }
                    }) {
                        Text(region)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(selectedRegion == region ? Color.blue : Color.gray.opacity(0.2))
                            .foregroundColor(selectedRegion == region ? .white : .primary)
                            .font(.callout.bold())
                            .cornerRadius(16)
                    }
                }
            }
            .padding(.horizontal)
        }
        .padding(.top, 8)
    }

    // --- Suggested Activities Filter Bar ---
    var activityFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(suggestedActivities, id: \.self) { activity in
                    Button(action: {
                        selectedActivity = activity
                        searchViewModel.filterActivity = activity == "All" ? nil : activity
                        searchViewModel.applyActivityFilter()
                    }) {
                        Text(activity)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(selectedActivity == activity ? Color.purple : Color.gray.opacity(0.15))
                            .foregroundColor(selectedActivity == activity ? .white : .primary)
                            .font(.callout)
                            .cornerRadius(15)
                    }
                }
            }
            .padding(.horizontal)
        }
        .padding(.top, 8)
    }

    // --- Places Grid ---
    var placesGrid: some View {
        let places = searchViewModel.filteredResults
        return ScrollView {
            LazyVGrid(columns: gridColumns, spacing: 16) {
                if places.isEmpty && !searchViewModel.isLoading {
                    Text("No places found for selected filters.")
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                }
                ForEach(places) { place in
                    DiscoverPlaceCell(place: place, handlePlaceTap: handlePlaceTap)
                }
            }
            .padding([.horizontal, .bottom])
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // --- Centered Discover Title ---
            HStack {
                Spacer()
                Text("Discover")
                    .font(.largeTitle.bold())
                    .foregroundColor(.primary)
                    .frame(maxWidth: .infinity, alignment: .center)
                Spacer()
            }
            .padding(.top, 24)
            .padding(.bottom, 2)

            regionFilterBar
            activityFilterBar

            // --- Modern Search Bar ---
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                TextField("Search places...", text: $searchViewModel.searchText)
                    .font(.body)
                    .foregroundColor(.primary)
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(16)
            .shadow(color: .black.opacity(0.04), radius: 2, x: 0, y: 1)
            .padding(.horizontal)
            .padding(.top, 8)

            if searchViewModel.isLoading {
                ProgressView("Searching...")
                    .padding(.top)
            }

            if let error = searchViewModel.errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .padding(.top)
            }

            placesGrid
                .padding(.top, 4)
        }
        .background(Color(.systemBackground).ignoresSafeArea())
        .sheet(item: $selectedPlace) { place in
            DestinationDetailView(
                place: place,
                groupViewModel: groupViewModel,
                currentUser: currentUser
            )
        }
        .alert(isPresented: .constant(detailError != nil)) {
            Alert(title: Text("Error"), message: Text(detailError ?? ""), dismissButton: .default(Text("OK")))
        }
        .overlay(
            loadingDetail ? ProgressView("Loading details...").padding().background(.ultraThinMaterial).cornerRadius(10) : nil
        )
        .sheet(isPresented: $searchViewModel.showAddToItinerarySheet) {
            if let place = searchViewModel.selectedPlace {
                AddToItinerarySheet(
                    trips: searchViewModel.trips,
                    place: place,
                    selectedTrip: .constant(nil),
                    selectedDate: .constant(Date()),
                    onAddExisting: { trip, date, place in
                        searchViewModel.addPlaceToTrip(trip: trip, date: date, place: place)
                        searchViewModel.showAddToItinerarySheet = false
                    },
                    onAddNew: { name, notes, date, place in
                        searchViewModel.createTripAndAddPlace(name: name, notes: notes, date: date, place: place)
                        searchViewModel.showAddToItinerarySheet = false
                    }
                )
            }
        }
        .onAppear {
            if searchViewModel.results.isEmpty && searchViewModel.searchText.isEmpty {
                Task { await searchViewModel.fetchTopPlaces(for: "tourist attractions in \(selectedRegion)") }
            }
        }
    }
}

// --- Place cell, always show name and address ---
fileprivate struct DiscoverPlaceCell: View {
    let place: Place
    let handlePlaceTap: (Place) -> Void

    var body: some View {
        Button(action: {
            handlePlaceTap(place)
        }) {
            VStack(spacing: 0) {
                if let photoRef = place.photoReferences?.first,
                   let url = googlePlacePhotoURL(photoReference: photoRef, maxWidth: 400) {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image
                                .resizable()
                                .scaledToFill()
                                .frame(height: 110)
                                .frame(maxWidth: .infinity)
                                .clipped()
                                .cornerRadius(14, corners: [.topLeft, .topRight])
                        } else if phase.error != nil {
                            Color.gray.opacity(0.1)
                                .frame(height: 110)
                                .overlay(Image(systemName: "exclamationmark.triangle").foregroundColor(.red))
                                .cornerRadius(14, corners: [.topLeft, .topRight])
                        } else {
                            Color.gray.opacity(0.1)
                                .frame(height: 110)
                                .overlay(ProgressView())
                                .cornerRadius(14, corners: [.topLeft, .topRight])
                        }
                    }
                } else {
                    Color.gray.opacity(0.1)
                        .frame(height: 110)
                        .overlay(Image(systemName: "photo").foregroundColor(.gray))
                        .cornerRadius(14, corners: [.topLeft, .topRight])
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(place.name)
                        .font(.headline)
                        .foregroundColor(.primary)
                        .lineLimit(2)
                        .padding(.top, 8)
                        .padding(.horizontal, 6)
                    if let address = place.address {
                        Text(address)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                            .padding(.horizontal, 6)
                    }
                    if let rating = place.rating {
                        HStack(spacing: 2) {
                            Image(systemName: "star.fill").foregroundColor(.yellow)
                            Text(String(format: "%.1f", rating))
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                        .padding(.horizontal, 6)
                        .padding(.bottom, 6)
                    } else {
                        Spacer().frame(height: 6)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.clear)
            }
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.04), radius: 3, x: 0, y: 2)
            )
            .frame(height: 190)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// Helper for Google Photos API
fileprivate func googlePlacePhotoURL(photoReference: String, maxWidth: Int = 400) -> URL? {
    let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU"
    var components = URLComponents(string: "https://places.googleapis.com/v1/\(photoReference)/media")
    components?.queryItems = [
        URLQueryItem(name: "key", value: apiKey),
        URLQueryItem(name: "maxWidthPx", value: "\(maxWidth)")
    ]
    return components?.url
}
