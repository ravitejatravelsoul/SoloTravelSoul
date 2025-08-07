import SwiftUI

fileprivate func googlePlacePhotoURL(photoReference: String, maxWidth: Int = 400) -> URL? {
    let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU"
    let urlString = "https://maps.googleapis.com/maps/api/place/photo?maxwidth=\(maxWidth)&photoreference=\(photoReference)&key=\(apiKey)"
    return URL(string: urlString)
}

fileprivate extension View {
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCorner(radius: radius, corners: corners))
    }
}

fileprivate struct RoundedCorner: Shape {
    var radius: CGFloat = 12.0
    var corners: UIRectCorner = .allCorners

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(path.cgPath)
    }
}

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

    var upcomingTripsSection: some View {
        VStack(alignment: .leading) {
            if !tripViewModel.trips.isEmpty {
                Text("Upcoming Group Trips")
                    .font(.title3)
                    .bold()
                    .padding(.horizontal)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(tripViewModel.trips) { trip in
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
            }
        }
    }

    var placesGrid: some View {
        ScrollView {
            LazyVGrid(columns: gridColumns, spacing: 12) {
                let places = searchViewModel.results
                ForEach(places) { place in
                    Button(action: {
                        handlePlaceTap(place: place)
                    }) {
                        VStack(spacing: 0) {
                            // IMAGE
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
                            // DETAILS
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
                                .cornerRadius(12)
                                .shadow(color: .black.opacity(0.03), radius: 2, x: 0, y: 2)
                        )
                        .frame(height: 180)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            .padding([.horizontal, .bottom])
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
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
                            searchViewModel.addPlaceToTrip(tripId: trip.id, date: date, place: place)
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
                    Task { await searchViewModel.fetchTopPlaces(for: "tourist attractions in Paris") }
                }
            }
        }
    }
}
