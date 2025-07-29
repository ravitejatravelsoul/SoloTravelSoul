import SwiftUI
import MapKit

struct EditingPlace: Identifiable, Equatable {
    let dayIdx: Int
    let placeIdx: Int
    var id: String { "\(dayIdx)-\(placeIdx)" }
}

fileprivate func googlePlacePhotoURL(photoReference: String, maxWidth: Int = 400) -> URL? {
    let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU"
    let urlString = "https://maps.googleapis.com/maps/api/place/photo?maxwidth=\(maxWidth)&photoreference=\(photoReference)&key=\(apiKey)"
    return URL(string: urlString)
}

fileprivate extension Date {
    func days(until end: Date) -> [Date] {
        var days: [Date] = []
        var current = self
        let calendar = Calendar.current
        while current <= end {
            days.append(current)
            guard let next = calendar.date(byAdding: .day, value: 1, to: current) else { break }
            current = next
        }
        return days
    }
}

fileprivate func estimateDuration(for place: Place) -> Double {
    let name = place.name.lowercased()
    if name.contains("universal studios") || name.contains("disney") || name.contains("theme park") || name.contains("sea world") || name.contains("legoland") {
        return 1.2
    } else if name.contains("zoo") || name.contains("aquarium") || name.contains("gatorland") || name.contains("water park") {
        return 0.7
    } else if name.contains("museum") || name.contains("gallery") || name.contains("exhibit") || name.contains("center") {
        return 0.35
    } else if name.contains("show") || name.contains("cinema") || name.contains("3d") {
        return 0.15
    } else {
        return 0.1
    }
}

struct TripDetailView: View {
    @ObservedObject var tripViewModel: TripViewModel
    @State var trip: PlannedTrip

    @State private var mainLocation: String = ""
    @StateObject private var placeSearchViewModel: PlaceSearchViewModel

    @State private var showAddPlaceSheet: Bool = false
    @State private var addPlaceDate: Date = Date()
    @State private var editingPlace: EditingPlace? = nil

    @State private var tripMapPosition = MapCameraPosition.region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 48.8584, longitude: 2.2945),
            span: MKCoordinateSpan(latitudeDelta: 1.0, longitudeDelta: 1.0)
        )
    )

    @State private var showSavedAlert: Bool = false
    @State private var showAutoPlanError: Bool = false
    @State private var autoPlanErrorMessage: String = ""
    @State private var showStartDatePicker: Bool = false
    @State private var showEndDatePicker: Bool = false

    @Environment(\.dismiss) private var dismiss

    init(tripViewModel: TripViewModel, trip: PlannedTrip) {
        self._tripViewModel = ObservedObject(wrappedValue: tripViewModel)
        self._trip = State(initialValue: trip)
        self._mainLocation = State(initialValue: trip.destination)
        self._placeSearchViewModel = StateObject(wrappedValue: PlaceSearchViewModel(tripViewModel: tripViewModel))
    }

    var body: some View {
        NavigationStack {
            Form {
                tripInfoSection
                mainLocationSection
                suggestionsSection
                if !trip.allPlaces.isEmpty { tripMapSection }
                itinerarySection
                saveSection
            }
            .sheet(item: $editingPlace) { edit in
                EditPlaceSheet(
                    place: $trip.itinerary[edit.dayIdx].places[edit.placeIdx],
                    onUpdate: { updatedPlace in
                        trip.itinerary[edit.dayIdx].places[edit.placeIdx] = updatedPlace
                        tripViewModel.updateTrip(trip)
                        editingPlace = nil
                    }
                )
            }
            .alert("Auto-Plan Failed", isPresented: $showAutoPlanError) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(autoPlanErrorMessage)
            }
            .navigationTitle("Edit Trip")
        }
    }

    // MARK: - Sections

    var tripInfoSection: some View {
        Section(header: Text("Trip Info")) {
            TextField("Trip Name", text: $trip.destination)
                .font(.title2)
                .autocapitalization(.words)

            Button(action: {
                showStartDatePicker = true
            }) {
                HStack {
                    Text("Start Date")
                    Spacer()
                    Text(trip.startDate, style: .date).foregroundColor(.gray)
                }
            }
            .sheet(isPresented: $showStartDatePicker) {
                VStack {
                    DatePicker(
                        "Select Start Date",
                        selection: $trip.startDate,
                        displayedComponents: .date
                    )
                    .datePickerStyle(.graphical)
                    .labelsHidden()
                    Button("Done") {
                        showStartDatePicker = false
                        showEndDatePicker = true
                        if trip.endDate < trip.startDate {
                            trip.endDate = trip.startDate
                        }
                    }
                    .padding(.top)
                }
                .padding()
            }

            Button(action: {
                showEndDatePicker = true
            }) {
                HStack {
                    Text("End Date")
                    Spacer()
                    Text(trip.endDate, style: .date).foregroundColor(.gray)
                }
            }
            .sheet(isPresented: $showEndDatePicker) {
                VStack {
                    DatePicker(
                        "Select End Date",
                        selection: $trip.endDate,
                        in: trip.startDate...,
                        displayedComponents: .date
                    )
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
    }

    var mainLocationSection: some View {
        Section(header: Text("Main City or Country")) {
            HStack {
                TextField("City or Country", text: $mainLocation)
                    .autocapitalization(.words)
                    .onSubmit { triggerLocationSuggestions() }
                Button(action: { triggerLocationSuggestions() }) {
                    Label("Search", systemImage: "magnifyingglass")
                }
                .buttonStyle(.bordered)
                .tint(.blue)
            }
        }
    }

    var suggestionsSection: some View {
        Section(header: Text("Suggestions")) {
            if placeSearchViewModel.isLoading {
                ProgressView("Searching...")
            }
            if let error = placeSearchViewModel.errorMessage {
                Text(error).foregroundColor(.red)
            }
            ForEach(placeSearchViewModel.results.prefix(15)) { place in
                HStack(alignment: .top, spacing: 12) {
                    if let photoRefs = place.photoReferences, let photoRef = photoRefs.first, let url = googlePlacePhotoURL(photoReference: photoRef) {
                        AsyncImage(url: url) { phase in
                            if let image = phase.image {
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(width: 60, height: 60)
                                    .clipped()
                                    .cornerRadius(8)
                            } else if phase.error != nil {
                                Color.gray.opacity(0.2)
                                    .frame(width: 60, height: 60)
                                    .cornerRadius(8)
                                    .overlay(Image(systemName: "photo"))
                            } else {
                                ProgressView()
                                    .frame(width: 60, height: 60)
                            }
                        }
                    } else {
                        Color.gray.opacity(0.1)
                            .frame(width: 60, height: 60)
                            .cornerRadius(8)
                            .overlay(Image(systemName: "photo"))
                    }

                    VStack(alignment: .leading) {
                        Text(place.name)
                            .font(.subheadline)
                            .bold()
                        if let address = place.address {
                            Text(address)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        Text("Est. \(formattedDuration(estimateDuration(for: place)))")
                            .font(.caption2)
                            .foregroundColor(.blue)
                    }
                    Spacer()
                    if itineraryContains(place) {
                        Button {
                            removePlaceFromItinerary(place)
                        } label: {
                            Label("Remove", systemImage: "minus.circle.fill")
                                .foregroundColor(.red)
                        }
                    } else {
                        Button {
                            addPlaceToItinerary(place)
                        } label: {
                            Label("Add", systemImage: "plus.circle.fill")
                                .foregroundColor(.blue)
                        }
                    }
                }
                .padding(.vertical, 4)
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
    }

    var tripMapSection: some View {
        Section(header: Text("Trip Map")) {
            Map(position: $tripMapPosition) {
                ForEach(trip.allPlaces) { place in
                    Marker(place.name, coordinate: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude))
                }
            }
            .frame(height: 200)
            .cornerRadius(12)
            .onAppear {
                if let first = trip.allPlaces.first {
                    tripMapPosition = MapCameraPosition.region(
                        MKCoordinateRegion(
                            center: CLLocationCoordinate2D(latitude: first.latitude, longitude: first.longitude),
                            span: MKCoordinateSpan(latitudeDelta: 1.0, longitudeDelta: 1.0)
                        )
                    )
                }
            }
        }
    }

    var itinerarySection: some View {
        Section(header: Text("Itinerary")) {
            if trip.itinerary.isEmpty {
                Text("No places added yet.")
                    .foregroundColor(.secondary)
            } else {
                ForEach(Array(trip.itinerary.enumerated()), id: \.element.id) { (dayIdx, day) in
                    VStack(alignment: .leading) {
                        Text(day.date, style: .date)
                            .font(.headline)
                        ForEach(Array(day.places.enumerated()), id: \.element.id) { (placeIdx, place) in
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(place.name)
                                    if let address = place.address {
                                        Text(address)
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                    Text("Est. \(formattedDuration(estimateDuration(for: place)))")
                                        .font(.caption2)
                                        .foregroundColor(.blue)
                                }
                                Spacer()
                                Button {
                                    editingPlace = EditingPlace(dayIdx: dayIdx, placeIdx: placeIdx)
                                } label: {
                                    Image(systemName: "pencil")
                                }
                                .buttonStyle(.plain)
                                Button(role: .destructive) {
                                    removePlaceFromDay(dayIdx: dayIdx, placeIdx: placeIdx)
                                } label: {
                                    Image(systemName: "trash")
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
        }
    }

    var saveSection: some View {
        Section {
            Button {
                tripViewModel.updateTrip(trip)
                showSavedAlert = true
            } label: {
                HStack {
                    Image(systemName: "checkmark.seal.fill")
                    Text("Save Trip Plan").bold()
                }
                .frame(maxWidth: .infinity)
                .padding()
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)
            .controlSize(.large)
            .cornerRadius(12)
            .alert("Trip Saved!", isPresented: $showSavedAlert) {
                Button("OK", role: .cancel) { dismiss() }
            }
        }
    }

    // MARK: - Logic

    private func autoPlanItinerary() {
        if mainLocation.trimmingCharacters(in: .whitespaces).isEmpty {
            autoPlanErrorMessage = "Please enter a city or country."
            showAutoPlanError = true
            return
        }
        Task {
            await placeSearchViewModel.fetchTopPlaces(for: mainLocation)
            let places = placeSearchViewModel.results.sorted {
                ($0.rating ?? 0, $0.userRatingsTotal ?? 0, $0.name) >
                ($1.rating ?? 0, $1.userRatingsTotal ?? 0, $1.name)
            }
            if places.isEmpty {
                autoPlanErrorMessage = "No places found for your destination."
                showAutoPlanError = true
                return
            }
            let dateList = trip.startDate.days(until: trip.endDate)
            if dateList.isEmpty {
                autoPlanErrorMessage = "Please select a valid date range."
                showAutoPlanError = true
                return
            }
            let placeTimeBlocks: [(Place, Double)] = places.map { ($0, estimateDuration(for: $0)) }
            var dayPlans: [[Place]] = Array(repeating: [], count: dateList.count)
            var dayTimeAllocated = Array(repeating: 0.0, count: dateList.count)
            var dayIdx = 0
            for (place, duration) in placeTimeBlocks {
                if duration >= 0.9 {
                    if dayIdx < dateList.count {
                        dayPlans[dayIdx].append(place)
                        dayTimeAllocated[dayIdx] += duration
                        dayIdx += 1
                    }
                } else {
                    while dayIdx < dateList.count && (dayTimeAllocated[dayIdx] + duration) > 0.9 {
                        dayIdx += 1
                    }
                    if dayIdx < dateList.count {
                        dayPlans[dayIdx].append(place)
                        dayTimeAllocated[dayIdx] += duration
                    } else {
                        break
                    }
                }
            }
            trip.itinerary = []
            for (i, day) in dateList.enumerated() {
                trip.itinerary.append(ItineraryDay(date: day, places: dayPlans[i]))
            }
            tripViewModel.updateTrip(trip)
        }
    }

    private func triggerLocationSuggestions() {
        guard !mainLocation.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        Task {
            await placeSearchViewModel.fetchTopPlaces(for: mainLocation)
        }
    }

    private func itineraryContains(_ place: Place) -> Bool {
        trip.itinerary.flatMap { $0.places }
            .contains(where: { $0.id == place.id && $0.name == place.name })
    }

    private func addPlaceToItinerary(_ place: Place) {
        let date = trip.itinerary.first?.date ?? trip.startDate
        addPlaceToDay(date: date, place: place)
    }

    private func addPlaceToDay(date: Date, place: Place) {
        if let dayIdx = trip.itinerary.firstIndex(where: { Calendar.current.isDate($0.date, inSameDayAs: date) }) {
            if !trip.itinerary[dayIdx].places.contains(where: { $0.id == place.id && $0.name == place.name }) {
                trip.itinerary[dayIdx].places.append(place)
            }
        } else {
            let newDay = ItineraryDay(date: date, places: [place])
            trip.itinerary.append(newDay)
        }
        tripViewModel.updateTrip(trip)
    }

    private func removePlaceFromItinerary(_ place: Place) {
        for (dayIdx, day) in trip.itinerary.enumerated() {
            if let placeIdx = day.places.firstIndex(where: { $0.id == place.id && $0.name == place.name }) {
                trip.itinerary[dayIdx].places.remove(at: placeIdx)
                tripViewModel.updateTrip(trip)
                break
            }
        }
    }

    private func removePlaceFromDay(dayIdx: Int, placeIdx: Int) {
        trip.itinerary[dayIdx].places.remove(at: placeIdx)
        tripViewModel.updateTrip(trip)
    }

    private func formattedDuration(_ duration: Double) -> String {
        if duration >= 1.0 { return "Full Day" }
        if duration >= 0.7 { return "3/4 Day" }
        if duration >= 0.35 { return "Half Day" }
        if duration >= 0.2 { return "2-3 hrs" }
        if duration >= 0.15 { return "1-1.5 hrs" }
        return "Quick Stop"
    }
}

// MARK: - EditPlaceSheet
struct EditPlaceSheet: View {
    @Binding var place: Place
    var onUpdate: (Place) -> Void

    @State private var name: String = ""
    @State private var address: String = ""
    @State private var latitude: String = ""
    @State private var longitude: String = ""
    @State private var notes: String = ""

    @Environment(\.presentationMode) var presentationMode

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Edit Place Details")) {
                    TextField("Name", text: $name)
                    TextField("Address", text: $address)
                    TextField("Latitude", text: $latitude)
                        .keyboardType(.decimalPad)
                    TextField("Longitude", text: $longitude)
                        .keyboardType(.decimalPad)
                    TextField("Notes", text: $notes)
                }
                Button("Save Changes") {
                    guard
                        !name.isEmpty,
                        let lat = Double(latitude),
                        let lng = Double(longitude)
                    else { return }
                    let updated = Place(
                        id: place.id,
                        name: name,
                        address: address.isEmpty ? nil : address,
                        latitude: lat,
                        longitude: lng,
                        types: place.types,
                        rating: place.rating,
                        userRatingsTotal: place.userRatingsTotal,
                        photoReferences: place.photoReferences,
                        reviews: place.reviews,
                        openingHours: place.openingHours,
                        phoneNumber: place.phoneNumber,
                        website: place.website
                    )
                    onUpdate(updated)
                    presentationMode.wrappedValue.dismiss()
                }
                .disabled(name.isEmpty || latitude.isEmpty || longitude.isEmpty)
            }
            .navigationTitle("Edit Place")
            .onAppear {
                name = place.name
                address = place.address ?? ""
                latitude = "\(place.latitude)"
                longitude = "\(place.longitude)"
                notes = "" // If you store notes in Place in future, use them here
            }
        }
    }
}
