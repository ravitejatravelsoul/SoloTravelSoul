import SwiftUI
import MapKit

struct EditingPlace: Identifiable, Equatable {
    let dayIdx: Int
    let placeIdx: Int
    var id: String { "\(dayIdx)-\(placeIdx)" }
}

fileprivate func googlePlacePhotoURL(photoReference: String, maxWidth: Int = 400) -> URL? {
    let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU"
    if photoReference.starts(with: "places/") {
        var c = URLComponents(string: "https://places.googleapis.com/v1/\(photoReference)/media")
        c?.queryItems = [
            URLQueryItem(name: "key", value: apiKey),
            URLQueryItem(name: "maxWidthPx", value: "\(maxWidth)")
        ]
        return c?.url
    } else {
        var c = URLComponents(string: "https://maps.googleapis.com/maps/api/place/photo")
        c?.queryItems = [
            URLQueryItem(name: "maxwidth", value: "\(maxWidth)"),
            URLQueryItem(name: "photoreference", value: photoReference),
            URLQueryItem(name: "key", value: apiKey)
        ]
        return c?.url
    }
}

struct TripDetailView: View {
    @ObservedObject var tripViewModel: TripViewModel
    @State var trip: PlannedTrip

    @State private var mainLocation: String
    @StateObject private var placeSearchViewModel: PlaceSearchViewModel

    @State private var editingPlace: EditingPlace? = nil
    @State private var showStartDatePicker = false
    @State private var showEndDatePicker = false
    @State private var showSavedAlert = false
    @State private var showAutoPlanError = false
    @State private var autoPlanErrorMessage = ""
    @State private var selectedJournalDay: ItineraryDay? = nil

    @State private var tripMapPosition = MapCameraPosition.region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 48.8584, longitude: 2.2945),
            span: MKCoordinateSpan(latitudeDelta: 1, longitudeDelta: 1)
        )
    )

    @Environment(\.dismiss) private var dismiss

    init(tripViewModel: TripViewModel, trip: PlannedTrip) {
        _tripViewModel = ObservedObject(wrappedValue: tripViewModel)
        _trip = State(initialValue: trip)
        _mainLocation = State(initialValue: trip.destination)
        _placeSearchViewModel = StateObject(wrappedValue: PlaceSearchViewModel(tripViewModel: tripViewModel))
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
                    place: Binding(
                        get: { trip.itinerary[edit.dayIdx].places[edit.placeIdx] },
                        set: { updated in
                            trip.itinerary[edit.dayIdx].places[edit.placeIdx] = updated
                            tripViewModel.updateTrip(trip)
                        }
                    ),
                    onUpdate: { _ in } // Binding already handles update
                )
            }
            .sheet(item: $selectedJournalDay) { day in
                TripJournalView(tripViewModel: tripViewModel, trip: trip, day: day)
            }
            .alert("Auto-Plan Failed", isPresented: $showAutoPlanError) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(autoPlanErrorMessage)
            }
            .alert("Trip Saved!", isPresented: $showSavedAlert) {
                Button("OK", role: .cancel) { dismiss() }
            }
            .navigationTitle("Edit Trip")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: Sections

    var tripInfoSection: some View {
        Section(header: Text("Trip Info")) {
            TextField("Trip Name", text: $trip.destination)
                .font(.title2)
                .autocapitalization(.words)

            Button {
                showStartDatePicker = true
            } label: {
                HStack {
                    Text("Start Date")
                    Spacer()
                    Text(trip.startDate, style: .date).foregroundColor(.gray)
                }
            }
            .sheet(isPresented: $showStartDatePicker) {
                VStack {
                    DatePicker("Select Start Date", selection: $trip.startDate, displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .labelsHidden()
                    Button("Done") {
                        showStartDatePicker = false
                        if trip.endDate < trip.startDate {
                            trip.endDate = trip.startDate
                        }
                    }
                    .padding(.top)
                }
                .padding()
            }

            Button {
                showEndDatePicker = true
            } label: {
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
                    Button("Done") { showEndDatePicker = false }
                        .padding(.top)
                }
                .padding()
            }

            TextField("Notes (optional)", text: $trip.notes, axis: .vertical)
                .lineLimit(3, reservesSpace: true)
        }
    }

    var mainLocationSection: some View {
        Section(header: Text("Main City or Country")) {
            HStack {
                TextField("City or Country", text: $mainLocation)
                    .autocapitalization(.words)
                    .onSubmit { triggerLocationSuggestions() }
                Button(action: triggerLocationSuggestions) {
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
                    if let photoRef = place.photoReferences?.first,
                       let url = googlePlacePhotoURL(photoReference: photoRef) {
                        AsyncImage(url: url) { phase in
                            if let image = phase.image {
                                image.resizable().aspectRatio(contentMode: .fill)
                            } else if phase.error != nil {
                                Color.gray.opacity(0.2)
                                    .overlay(Image(systemName: "exclamationmark.triangle").foregroundColor(.red))
                            } else {
                                Color.gray.opacity(0.2).overlay(ProgressView())
                            }
                        }
                        .frame(width: 60, height: 60)
                        .clipped()
                        .cornerRadius(8)
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
                    Marker(place.name,
                           coordinate: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude))
                }
            }
            .frame(height: 200)
            .cornerRadius(12)
            .onAppear {
                if let first = trip.allPlaces.first {
                    tripMapPosition = .region(
                        MKCoordinateRegion(
                            center: .init(latitude: first.latitude, longitude: first.longitude),
                            span: .init(latitudeDelta: 1, longitudeDelta: 1)
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
                        HStack {
                            Text(day.date, style: .date)
                                .font(.headline)
                            Spacer()
                            Button {
                                selectedJournalDay = day
                            } label: {
                                Image(systemName: "book.closed.fill")
                                Text("Journal")
                            }
                            .buttonStyle(.bordered)
                            .tint(.blue)
                        }
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
        }
    }

    // MARK: Helpers
    private func triggerLocationSuggestions() {
        guard !mainLocation.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        Task { await placeSearchViewModel.fetchTopPlaces(for: mainLocation) }
    }

    private func formattedDuration(_ d: Double) -> String {
        if d >= 1.0 { return "Full Day" }
        if d >= 0.7 { return "3/4 Day" }
        if d >= 0.35 { return "Half Day" }
        if d >= 0.2 { return "2-3 hrs" }
        if d >= 0.15 { return "1-1.5 hrs" }
        return "Quick Stop"
    }

    private func estimateDuration(for place: Place) -> Double {
        let n = place.name.lowercased()
        if n.contains("universal") || n.contains("disney") || n.contains("theme park") { return 1.2 }
        if n.contains("zoo") || n.contains("aquarium") || n.contains("water park") { return 0.7 }
        if n.contains("museum") || n.contains("gallery") || n.contains("exhibit") { return 0.35 }
        if n.contains("show") || n.contains("cinema") { return 0.15 }
        return 0.1
    }

    private func itineraryContains(_ place: Place) -> Bool {
        trip.itinerary.flatMap { $0.places }.contains { $0.id == place.id }
    }

    private func addPlaceToItinerary(_ place: Place) {
        let date = trip.itinerary.first?.date ?? trip.startDate
        addPlaceToDay(date: date, place: place)
    }

    private func addPlaceToDay(date: Date, place: Place) {
        if let idx = trip.itinerary.firstIndex(where: { Calendar.current.isDate($0.date, inSameDayAs: date) }) {
            if !trip.itinerary[idx].places.contains(where: { $0.id == place.id }) {
                trip.itinerary[idx].places.append(place)
            }
        } else {
            trip.itinerary.append(ItineraryDay(date: date, places: [place]))
        }
        tripViewModel.updateTrip(trip)
    }

    private func removePlaceFromItinerary(_ place: Place) {
        for (dIdx, day) in trip.itinerary.enumerated() {
            if let pIdx = day.places.firstIndex(where: { $0.id == place.id }) {
                trip.itinerary[dIdx].places.remove(at: pIdx)
                tripViewModel.updateTrip(trip)
                break
            }
        }
    }

    private func removePlaceFromDay(dayIdx: Int, placeIdx: Int) {
        trip.itinerary[dayIdx].places.remove(at: placeIdx)
        tripViewModel.updateTrip(trip)
    }

    private func autoPlanItinerary() {
        if mainLocation.trimmingCharacters(in: .whitespaces).isEmpty {
            autoPlanErrorMessage = "Please enter a city or country."
            showAutoPlanError = true
            return
        }
        Task {
            await placeSearchViewModel.fetchTopPlaces(for: mainLocation)
            let ranked = placeSearchViewModel.results.sorted {
                ($0.rating ?? 0, $0.userRatingsTotal ?? 0, $0.name) >
                ($1.rating ?? 0, $1.userRatingsTotal ?? 0, $1.name)
            }
            if ranked.isEmpty {
                autoPlanErrorMessage = "No places found for your destination."
                showAutoPlanError = true
                return
            }
            let dateList = trip.startDate.days(until: trip.endDate)
            if dateList.isEmpty {
                autoPlanErrorMessage = "Select a valid date range."
                showAutoPlanError = true
                return
            }
            let blocks = ranked.map { ($0, estimateDuration(for: $0)) }
            var dayPlans: [[Place]] = Array(repeating: [], count: dateList.count)
            var dayTime = Array(repeating: 0.0, count: dateList.count)
            var di = 0
            for (place, dur) in blocks {
                if dur >= 0.9 {
                    if di < dateList.count {
                        dayPlans[di].append(place)
                        dayTime[di] += dur
                        di += 1
                    }
                } else {
                    while di < dateList.count && (dayTime[di] + dur) > 0.9 { di += 1 }
                    if di < dateList.count {
                        dayPlans[di].append(place)
                        dayTime[di] += dur
                    } else { break }
                }
            }
            trip.itinerary = zip(dateList, dayPlans).map { ItineraryDay(date: $0.0, places: $0.1) }
            tripViewModel.updateTrip(trip)
        }
    }
}

// MARK: - EditPlaceSheet
struct EditPlaceSheet: View {
    @Binding var place: Place
    var onUpdate: (Place) -> Void

    @State private var name = ""
    @State private var address = ""
    @State private var latitude = ""
    @State private var longitude = ""
    @State private var notes = ""

    @Environment(\.presentationMode) var presentationMode

    var body: some View {
        NavigationStack {
            Form {
                Section("Edit Place Details") {
                    TextField("Name", text: $name)
                    TextField("Address", text: $address)
                    TextField("Latitude", text: $latitude).keyboardType(.decimalPad)
                    TextField("Longitude", text: $longitude).keyboardType(.decimalPad)
                    TextField("Notes (optional)", text: $notes)
                }
                Button("Save Changes") {
                    guard
                        !name.isEmpty,
                        let lat = Double(latitude),
                        let lon = Double(longitude)
                    else { return }
                    let updated = Place(
                        id: place.id,
                        name: name,
                        address: address.isEmpty ? nil : address,
                        latitude: lat,
                        longitude: lon,
                        types: place.types,
                        rating: place.rating,
                        userRatingsTotal: place.userRatingsTotal,
                        photoReferences: place.photoReferences,
                        reviews: place.reviews,
                        openingHours: place.openingHours,
                        phoneNumber: place.phoneNumber,
                        website: place.website,
                        journalEntries: place.journalEntries
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
            }
        }
    }
}

// MARK: - Date Helper
private extension Date {
    func days(until end: Date) -> [Date] {
        guard self <= end else { return [] }
        var dates: [Date] = []
        var current = self
        let cal = Calendar.current
        repeat {
            dates.append(current)
            current = cal.date(byAdding: .day, value: 1, to: current)!
        } while current <= end
        return dates
    }
}
