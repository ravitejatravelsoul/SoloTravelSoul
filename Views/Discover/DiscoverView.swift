import SwiftUI

struct DiscoverView: View {
    @EnvironmentObject var tripViewModel: TripViewModel
    @ObservedObject var searchViewModel: PlaceSearchViewModel
    @State private var selectedTrip: PlannedTrip? = nil
    @State private var selectedDate: Date = Date()
    @State private var selectedPlace: Place? = nil
    @State private var showPlaceDetail: Bool = false
    @State private var showTripDetail: Bool = false
    @State private var loadingDetail: Bool = false
    @State private var detailError: String? = nil

    let gridColumns: [GridItem] = [GridItem(.flexible()), GridItem(.flexible())]

    // Region and activity filters
    @State private var selectedRegion: String = "Paris"
    @State private var selectedActivity: String = "All"
    let regions = ["Paris", "London", "New York", "Tokyo", "Rome", "Sydney"]

    // Date filter for trips and places
    @State private var filterDate: Date = Date()

    init(tripViewModel: TripViewModel) {
        self._searchViewModel = ObservedObject(wrappedValue: PlaceSearchViewModel(tripViewModel: tripViewModel))
    }

    private func handlePlaceTap(place: Place) {
        loadingDetail = true
        detailError = nil
        searchViewModel.fetchPlaceDetails(placeID: place.id) { detailedPlace, error in
            DispatchQueue.main.async {
                loadingDetail = false
                if let detailedPlace = detailedPlace {
                    self.selectedPlace = detailedPlace
                    self.showPlaceDetail = true
                } else {
                    self.detailError = error ?? "Failed to load details"
                }
            }
        }
    }

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
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(selectedRegion == region ? Color.blue : Color.gray.opacity(0.2))
                            .foregroundColor(selectedRegion == region ? .white : .primary)
                            .cornerRadius(16)
                    }
                }
            }
            .padding(.horizontal)
        }
    }

    var activityFilterBar: some View {
        let activities = searchViewModel.availableActivities
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(activities, id: \.self) { activity in
                    Button(action: {
                        selectedActivity = activity
                        if activity == "All" {
                            searchViewModel.filterActivity = nil
                        } else {
                            searchViewModel.filterActivity = activity
                        }
                        searchViewModel.applyActivityFilter()
                    }) {
                        HStack {
                            Text(activity)
                            if activity != "All" {
                                let count = searchViewModel.results.filter {
                                    $0.types?.contains(where: { $0.localizedCaseInsensitiveContains(activity) }) ?? false
                                }.count
                                if count > 0 {
                                    Text("\(count)")
                                        .font(.caption2)
                                        .foregroundColor(.white)
                                        .padding(4)
                                        .background(Circle().fill(Color.purple))
                                }
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(selectedActivity == activity ? Color.purple : Color.gray.opacity(0.15))
                        .foregroundColor(selectedActivity == activity ? .white : .primary)
                        .cornerRadius(16)
                    }
                }
            }
            .padding(.horizontal)
        }
    }
    
    var dateFilterBar: some View {
        HStack {
            Text("Date:")
                .font(.subheadline)
            DatePicker(
                "",
                selection: $filterDate,
                displayedComponents: [.date]
            )
            .labelsHidden()
            .datePickerStyle(.compact)
        }
        .padding(.horizontal)
        .padding(.top, 4)
    }

    var upcomingTripsSection: some View {
        let filteredTrips = tripViewModel.trips.filter {
            $0.startDate <= filterDate && $0.endDate >= filterDate
        }
        return VStack(alignment: .leading) {
            if !filteredTrips.isEmpty {
                Text("Upcoming Group Trips")
                    .font(.title3)
                    .bold()
                    .padding(.horizontal)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(filteredTrips) { trip in
                            Button {
                                selectedTrip = trip
                                showTripDetail = true
                            } label: {
                                PlannedTripCardView(trip: trip)
                            }
                            .buttonStyle(PlainButtonStyle())
                        }
                    }
                    .padding(.horizontal)
                }
                .padding(.bottom, 8)
            } else {
                Text("No group trips for selected date.")
                    .foregroundColor(.secondary)
                    .padding(.horizontal)
                    .padding(.bottom, 8)
            }
        }
    }

    var placesGrid: some View {
        let tripsOnDate = tripViewModel.trips.filter { $0.startDate <= filterDate && $0.endDate >= filterDate }
        let placeIdsOnTrips = Set(tripsOnDate.flatMap { $0.allPlaces.map { $0.id } })
        let places: [Place]
        if !tripsOnDate.isEmpty {
            places = searchViewModel.filteredResults.filter { placeIdsOnTrips.contains($0.id) }
        } else {
            places = searchViewModel.filteredResults
        }
        return ScrollView {
            LazyVGrid(columns: gridColumns, spacing: 12) {
                if places.isEmpty && !searchViewModel.isLoading {
                    Text("No places found for selected filters and date.")
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
        NavigationStack {
            VStack(spacing: 0) {
                regionFilterBar
                activityFilterBar
                dateFilterBar
                TextField("Search places...", text: $searchViewModel.searchText)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .padding([.horizontal, .top])

                if searchViewModel.isLoading {
                    ProgressView("Searching...")
                        .padding(.top)
                }

                if let error = searchViewModel.errorMessage {
                    Text(error)
                        .foregroundColor(.red)
                        .padding(.top)
                }

                upcomingTripsSection
                placesGrid
            }
            .navigationTitle("Discover")
            .sheet(isPresented: $showPlaceDetail, onDismiss: {
                self.selectedPlace = nil
            }) {
                if let place = selectedPlace {
                    PlaceDetailView(place: place)
                }
            }
            .sheet(isPresented: $showTripDetail, onDismiss: {
                self.selectedTrip = nil
            }) {
                if let trip = selectedTrip {
                    TripDetailView(tripViewModel: tripViewModel, trip: trip)
                }
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
                        selectedTrip: $selectedTrip,
                        selectedDate: $selectedDate,
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
}

// Extracted for compiler performance and reusability
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
                                .frame(height: 100)
                                .frame(maxWidth: .infinity)
                                .clipped()
                                .cornerRadius(12, corners: [.topLeft, .topRight])
                        } else if phase.error != nil {
                            Color.gray.opacity(0.1)
                                .frame(height: 100)
                                .overlay(Image(systemName: "exclamationmark.triangle").foregroundColor(.red))
                                .cornerRadius(12, corners: [.topLeft, .topRight])
                        } else {
                            Color.gray.opacity(0.1)
                                .frame(height: 100)
                                .overlay(ProgressView())
                                .cornerRadius(12, corners: [.topLeft, .topRight])
                        }
                    }
                } else {
                    Color.gray.opacity(0.1)
                        .frame(height: 100)
                        .overlay(Image(systemName: "photo").foregroundColor(.gray))
                        .cornerRadius(12, corners: [.topLeft, .topRight])
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(place.name)
                        .font(.headline)
                        .lineLimit(2)
                    if let address = place.address {
                        Text(address)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                    }
                    if let rating = place.rating {
                        HStack(spacing: 2) {
                            Image(systemName: "star.fill").foregroundColor(.yellow)
                            Text(String(format: "%.1f", rating))
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                .padding(8)
            }
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                    .background(Color(.systemBackground))
                    .cornerRadius(12, corners: [.topLeft, .topRight])
                    .shadow(color: .black.opacity(0.03), radius: 2, x: 0, y: 2)
            )
            .frame(height: 180)
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
