import SwiftUI

struct DiscoverView: View {
    @EnvironmentObject var tripViewModel: TripViewModel
    @ObservedObject var searchViewModel: PlaceSearchViewModel
    @State private var selectedTrip: PlannedTrip?
    @State private var selectedDate: Date = Date()

    // Custom initializer to inject tripViewModel from environment into ObservedObject
    init(tripViewModel: TripViewModel) {
        self._searchViewModel = ObservedObject(wrappedValue: PlaceSearchViewModel(tripViewModel: tripViewModel))
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
                    NavigationLink(destination: Text(place.name)) { // Replace with your PlaceDetailView
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
            // If you have AddToItinerarySheet, make sure it's imported and available
            .sheet(isPresented: $searchViewModel.showAddToItinerarySheet) {
                if let place = searchViewModel.selectedPlace {
                    // Uncomment and implement AddToItinerarySheet if you have it
                    /*
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
                    */
                    // For now, fallback to simple text:
                    Text("Add To Itinerary Sheet not implemented")
                } else {
                    // Show nothing if no place is selected
                    EmptyView()
                }
            }
        }
    }
}
