import SwiftUI
import MapKit

struct CreateTripView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var tripViewModel: TripViewModel

    @State private var destination: String = ""
    @State private var notes: String = ""
    @State private var startDate: Date = Date()
    @State private var endDate: Date = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var showStartDatePicker = false
    @State private var showEndDatePicker = false
    @State private var cityOrCountry: String = ""
    @StateObject private var placeSearchViewModel: PlaceSearchViewModel
    @State private var selectedPlaces: [Place] = []
    @State private var plannedItinerary: [ItineraryDay] = []
    @State private var itinerarySuggestions: [Place] = []
    @State private var tripMapPosition = MapCameraPosition.region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 48.8584, longitude: 2.2945),
            span: MKCoordinateSpan(latitudeDelta: 1.0, longitudeDelta: 1.0)
        )
    )
    @State private var showAutoPlanError: Bool = false
    @State private var autoPlanErrorMessage: String = ""
    @State private var showSavedAlert: Bool = false

    init() {
        _placeSearchViewModel = StateObject(wrappedValue: PlaceSearchViewModel(tripViewModel: TripViewModel()))
    }

    var body: some View {
        NavigationView {
            Form {
                // Destination and notes
                Section(header: Text("Destination")) {
                    TextField("e.g. Paris, Tokyo, Sydney", text: $destination)
                        .autocapitalization(.words)
                }
                Section(header: Text("Notes")) {
                    TextEditor(text: $notes)
                        .frame(height: 60)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.secondary.opacity(0.2))
                        )
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(8)
                }
                // Date selection
                Section(header: Text("Trip Dates")) {
                    Button(action: { showStartDatePicker = true }) {
                        HStack {
                            Text("Start Date")
                            Spacer()
                            Text(startDate, style: .date).foregroundColor(.gray)
                        }
                    }
                    .sheet(isPresented: $showStartDatePicker) {
                        VStack {
                            DatePicker("Select Start Date", selection: $startDate, displayedComponents: .date)
                                .datePickerStyle(.graphical)
                                .labelsHidden()
                            Button("Next") {
                                showStartDatePicker = false
                                showEndDatePicker = true
                                if endDate < startDate {
                                    endDate = startDate
                                }
                            }
                            .padding(.top)
                        }
                        .padding()
                    }
                    Button(action: { showEndDatePicker = true }) {
                        HStack {
                            Text("End Date")
                            Spacer()
                            Text(endDate, style: .date).foregroundColor(.gray)
                        }
                    }
                    .sheet(isPresented: $showEndDatePicker) {
                        VStack {
                            DatePicker("Select End Date", selection: $endDate, in: startDate..., displayedComponents: .date)
                                .datePickerStyle(.graphical)
                                .labelsHidden()
                            Button("Done") {
                                showEndDatePicker = false
                            }
                            .padding(.top)
                        }
                        .padding()
                    }
                }
                // City/Country and place search
                Section(header: Text("Main City or Country")) {
                    HStack {
                        TextField("City or Country", text: $cityOrCountry)
                            .autocapitalization(.words)
                            .onSubmit { triggerLocationSuggestions() }
                        Button(action: { triggerLocationSuggestions() }) {
                            Label("Search", systemImage: "magnifyingglass")
                        }
                        .buttonStyle(.bordered)
                        .tint(.blue)
                    }
                }

                Section(header: Text("Top Places")) {
                    if placeSearchViewModel.isLoading {
                        ProgressView("Searching...")
                    }
                    if let error = placeSearchViewModel.errorMessage {
                        Text(error).foregroundColor(.red)
                    }
                    ForEach(placeSearchViewModel.results.prefix(15)) { place in
                        HStack {
                            Text(place.name)
                                .font(.subheadline)
                            Spacer()
                            Button(action: {
                                togglePlaceSelection(place)
                            }) {
                                Image(systemName: selectedPlaces.contains(where: { $0.id == place.id }) ? "minus.circle.fill" : "plus.circle.fill")
                                    .foregroundColor(selectedPlaces.contains(where: { $0.id == place.id }) ? .red : .blue)
                            }
                        }
                    }
                    Button {
                        autoPlanItinerary()
                    } label: {
                        HStack {
                            Image(systemName: "sparkles")
                            Text("Auto-Plan Itinerary").bold()
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.bordered)
                    .tint(.purple)
                }

                // Map and planned itinerary
                if !plannedItinerary.isEmpty {
                    Section(header: Text("Trip Map")) {
                        Map(position: $tripMapPosition) {
                            ForEach(plannedItinerary.flatMap { $0.places }) { place in
                                Marker(place.name, coordinate: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude))
                            }
                        }
                        .frame(height: 200)
                        .cornerRadius(12, corners: [.topLeft, .topRight])
                        .onAppear {
                            if let first = plannedItinerary.first?.places.first {
                                tripMapPosition = MapCameraPosition.region(
                                    MKCoordinateRegion(
                                        center: CLLocationCoordinate2D(latitude: first.latitude, longitude: first.longitude),
                                        span: MKCoordinateSpan(latitudeDelta: 1.0, longitudeDelta: 1.0)
                                    )
                                )
                            }
                        }
                    }
                    Section(header: Text("Planned Itinerary")) {
                        ForEach(plannedItinerary) { day in
                            VStack(alignment: .leading) {
                                Text(day.date, style: .date)
                                    .font(.headline)
                                    .padding(.bottom, 2)
                                ForEach(day.places) { place in
                                    Text(place.name)
                                }
                            }.padding(.vertical, 3)
                        }
                    }
                    if !itinerarySuggestions.isEmpty {
                        Section(header: Text("You might also like")) {
                            ForEach(itinerarySuggestions) { place in
                                Text(place.name)
                            }
                        }
                    }
                } else if !selectedPlaces.isEmpty {
                    Section(header: Text("Selected Places")) {
                        ForEach(selectedPlaces) { place in
                            Text(place.name)
                        }
                    }
                }

                // Save button
                Section {
                    Button(action: saveTrip) {
                        HStack {
                            Image(systemName: "checkmark.seal.fill")
                            Text("Save Trip Plan").bold()
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .disabled(destination.isEmpty || cityOrCountry.isEmpty || plannedItinerary.isEmpty)
                    .alert("Trip Saved!", isPresented: $showSavedAlert) {
                        Button("OK", role: .cancel) { dismiss() }
                    }
                }
            }
            .navigationTitle("Create Trip")
            .navigationBarTitleDisplayMode(.inline)
            .alert("Auto-Plan Failed", isPresented: $showAutoPlanError) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(autoPlanErrorMessage)
            }
        }
    }

    // MARK: - Logic

    private func triggerLocationSuggestions() {
        guard !cityOrCountry.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        Task {
            await placeSearchViewModel.fetchTopPlaces(for: cityOrCountry)
        }
    }

    private func togglePlaceSelection(_ place: Place) {
        if let idx = selectedPlaces.firstIndex(where: { $0.id == place.id }) {
            selectedPlaces.remove(at: idx)
        } else {
            selectedPlaces.append(place)
        }
    }

    private func autoPlanItinerary() {
        if cityOrCountry.trimmingCharacters(in: .whitespaces).isEmpty {
            autoPlanErrorMessage = "Please enter a city or country."
            showAutoPlanError = true
            return
        }
        if selectedPlaces.isEmpty {
            autoPlanErrorMessage = "Please select at least one place to auto-plan."
            showAutoPlanError = true
            return
        }
        Task {
            let foodSpots = await placeSearchViewModel.fetchFoodPlaces(for: cityOrCountry)
            let tempTrip = PlannedTrip(
                id: UUID(),
                destination: destination.isEmpty ? cityOrCountry : destination,
                startDate: startDate,
                endDate: endDate,
                notes: notes,
                itinerary: [],
                photoData: nil,
                latitude: nil,
                longitude: nil,
                placeName: nil,
                members: []
            )
            let (itinerary, suggestions) = ItineraryPlanner.autoPlan(
                places: selectedPlaces,
                foodSpots: foodSpots,
                trip: tempTrip
            )
            plannedItinerary = itinerary
            itinerarySuggestions = suggestions
        }
    }

    private func saveTrip() {
        guard !plannedItinerary.isEmpty else { return }
        let newTrip = PlannedTrip(
            id: UUID(),
            destination: destination,
            startDate: startDate,
            endDate: endDate,
            notes: notes,
            itinerary: plannedItinerary,
            photoData: nil,
            latitude: nil,
            longitude: nil,
            placeName: nil,
            members: []
        )
        tripViewModel.addTrip(newTrip)
        showSavedAlert = true
    }
}
