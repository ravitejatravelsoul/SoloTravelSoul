import SwiftUI

struct DiscoverView: View {
    @EnvironmentObject var tripViewModel: TripViewModel
    @StateObject private var searchViewModel: PlaceSearchViewModel
    @State private var selectedTrip: PlannedTrip?
    @State private var selectedDate: Date = Date()

    init() {
        // This will be replaced by @EnvironmentObject onAppear
        _searchViewModel = StateObject(wrappedValue: PlaceSearchViewModel(tripViewModel: TripViewModel()))
    }

    var body: some View {
        NavigationStack {
            VStack {
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

                List(searchViewModel.results) { place in
                    NavigationLink(destination: PlaceDetailView(
                        place: place,
                        onAddToItinerary: {
                            searchViewModel.selectedPlace = place
                            searchViewModel.showAddToItinerarySheet = true
                        })
                    ) {
                        VStack(alignment: .leading) {
                            Text(place.name)
                                .font(.headline)
                            if let address = place.address {
                                Text(address)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
            .navigationTitle("Discover")
            .onAppear {
                // Inject correct instance on appear
                searchViewModel.setTripViewModel(tripViewModel)
            }
            .sheet(isPresented: $searchViewModel.showAddToItinerarySheet) {
                if let selectedPlace = searchViewModel.selectedPlace {
                    AddToItinerarySheet(
                        trips: searchViewModel.trips, // <--- THIS IS THE KEY LINE
                        place: selectedPlace,
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
        }
    }
}
