import Foundation
import SwiftUI
import MapKit
import CoreLocation

private let GOOGLE_PLACES_API_KEY = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU"

fileprivate func googlePlacePhotoURL(photoReference: String, maxWidth: Int = 400) -> URL? {
    let apiKey = GOOGLE_PLACES_API_KEY
    if photoReference.starts(with: "places/") {
        var components = URLComponents(string: "https://places.googleapis.com/v1/\(photoReference)/media")
        components?.queryItems = [
            URLQueryItem(name: "key", value: apiKey),
            URLQueryItem(name: "maxWidthPx", value: "\(maxWidth)")
        ]
        return components?.url
    } else {
        var components = URLComponents(string: "https://maps.googleapis.com/maps/api/place/photo")
        components?.queryItems = [
            URLQueryItem(name: "maxwidth", value: "\(maxWidth)"),
            URLQueryItem(name: "photoreference", value: photoReference),
            URLQueryItem(name: "key", value: apiKey)
        ]
        return components?.url
    }
}

enum PlaceType: String, CaseIterable, Identifiable {
    case restaurant, cafe, bar, attraction, trail
    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .restaurant: return "Restaurants"
        case .cafe: return "Cafes"
        case .bar: return "Bars"
        case .attraction: return "Attractions"
        case .trail: return "Trails"
        }
    }
    var systemImage: String {
        switch self {
        case .restaurant: return "fork.knife"
        case .cafe: return "cup.and.saucer"
        case .bar: return "wineglass"
        case .attraction: return "star.fill"
        case .trail: return "figure.hiking"
        }
    }
    var color: Color {
        switch self {
        case .restaurant: return .red
        case .cafe: return .brown
        case .bar: return .purple
        case .attraction: return .orange
        case .trail: return .green
        }
    }
    var googleType: String? {
        switch self {
        case .restaurant: return "restaurant"
        case .cafe: return "cafe"
        case .bar: return "bar"
        case .attraction: return "tourist_attraction"
        case .trail: return nil
        }
    }
    var googleKeyword: String? {
        switch self {
        case .trail: return "trail"
        default: return nil
        }
    }
}

struct DiscoverPlace: Identifiable, Equatable {
    let id: UUID
    let name: String
    let coordinate: CLLocationCoordinate2D
    let type: PlaceType
    var rating: Double
    let placeID: String
    var isOpen: Bool?
    var openHours: [String] = []
    var overview: String?
    var photos: [String] = []
    var reviews: [PlaceReview] = []
    var userRatingsTotal: Int? = nil
    var detailsLoaded: Bool = false

    static func == (lhs: DiscoverPlace, rhs: DiscoverPlace) -> Bool { lhs.id == rhs.id }
}

final class ObservablePlace: ObservableObject, Identifiable {
    @Published var id: UUID
    @Published var name: String
    @Published var coordinate: CLLocationCoordinate2D
    @Published var type: PlaceType
    @Published var rating: Double
    @Published var placeID: String
    @Published var isOpen: Bool?
    @Published var openHours: [String]
    @Published var overview: String?
    @Published var photos: [String]
    @Published var reviews: [PlaceReview]
    @Published var userRatingsTotal: Int?

    init(from place: DiscoverPlace) {
        self.id = place.id
        self.name = place.name
        self.coordinate = place.coordinate
        self.type = place.type
        self.rating = place.rating
        self.placeID = place.placeID
        self.isOpen = place.isOpen
        self.openHours = place.openHours
        self.overview = place.overview
        self.photos = place.photos
        self.reviews = place.reviews
        self.userRatingsTotal = place.userRatingsTotal
    }

    func update(from place: DiscoverPlace) {
        guard place.id == self.id else { return }
        self.isOpen = place.isOpen
        self.openHours = place.openHours
        self.overview = place.overview
        self.photos = place.photos
        self.reviews = place.reviews
        self.rating = place.rating
        self.userRatingsTotal = place.userRatingsTotal
    }
}

extension MKCoordinateRegion {
    static var defaultRegion: MKCoordinateRegion {
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194),
            span: MKCoordinateSpan(latitudeDelta: 0.12, longitudeDelta: 0.12)
        )
    }
}
func regionsAreEqual(_ lhs: MKCoordinateRegion, _ rhs: MKCoordinateRegion) -> Bool {
    lhs.center.latitude == rhs.center.latitude &&
    lhs.center.longitude == rhs.center.longitude &&
    lhs.span.latitudeDelta == rhs.span.latitudeDelta &&
    lhs.span.longitudeDelta == rhs.span.longitudeDelta
}
func approximateRadius(from region: MKCoordinateRegion) -> Double {
    let latMeters = region.span.latitudeDelta * 111_000.0
    let lonMeters = region.span.longitudeDelta * 111_000.0 * cos(region.center.latitude * .pi / 180)
    let diameter = max(abs(latMeters), abs(lonMeters))
    return max(100, min(50_000, diameter / 2))
}

enum CustomMapCameraPosition {
    case region(MKCoordinateRegion)
}
extension CustomMapCameraPosition: Equatable {
    static func == (lhs: CustomMapCameraPosition, rhs: CustomMapCameraPosition) -> Bool {
        switch (lhs, rhs) {
        case let (.region(r1), .region(r2)):
            return regionsAreEqual(r1, r2)
        }
    }
}
extension CustomMapCameraPosition {
    var regionValue: MKCoordinateRegion? {
        switch self {
        case let .region(region): return region
        }
    }
}

struct DiscoverFilters: Equatable {
    enum SortBy: String, CaseIterable, Identifiable {
        case distance = "Distance"
        case rating = "Rating"
        case name = "Name"
        var id: String { rawValue }
    }
    var minRating: Double = 0.0
    var onlyOpenNow: Bool = false
    var maxResults: Int = 50
    var sortBy: SortBy = .distance
}

private struct DiscoverPlaceDetailSheet: View {
    @ObservedObject var place: ObservablePlace
    var isLoading: Bool = false

    private var averageRatingText: String {
        String(format: "%.1f", place.rating)
    }
    private var reviewsCountText: String {
        if let total = place.userRatingsTotal {
            return "(\(total) reviews)"
        } else {
            return "(\(place.reviews.count) reviews)"
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if let firstPhoto = place.photos.first,
                   let url = googlePlacePhotoURL(photoReference: firstPhoto, maxWidth: 600) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .empty:
                            ZStack {
                                Color.gray.opacity(0.2)
                                ProgressView()
                            }
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .transition(.opacity)
                        case .failure:
                            ZStack {
                                Color.gray.opacity(0.2)
                                Image(systemName: "photo")
                                    .font(.largeTitle)
                                    .foregroundColor(.gray)
                            }
                        @unknown default:
                            EmptyView()
                        }
                    }
                    .frame(height: 220)
                    .clipped()
                    .cornerRadius(16)
                    .padding([.top, .horizontal])
                } else {
                    ZStack {
                        Color.gray.opacity(0.1)
                        Image(systemName: place.type.systemImage)
                            .font(.largeTitle)
                            .foregroundColor(.gray)
                    }
                    .frame(height: 220)
                    .cornerRadius(16)
                    .padding([.top, .horizontal])
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text(place.name)
                        .font(.title)
                        .bold()
                        .lineLimit(2)

                    HStack(spacing: 6) {
                        Label(averageRatingText, systemImage: "star.fill")
                            .foregroundColor(.yellow)
                            .font(.headline)
                        Text(reviewsCountText)
                            .foregroundColor(.secondary)
                            .font(.subheadline)
                    }
                }
                .padding(.horizontal)
                .padding(.top, 8)

                Divider()
                    .padding(.vertical, 12)

                if let overview = place.overview, !overview.isEmpty {
                    Text(overview)
                        .font(.callout)
                        .foregroundColor(.primary)
                        .padding(.horizontal)
                        .padding(.bottom)
                }
                else if !place.reviews.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recent Reviews")
                            .font(.headline)
                        ForEach(place.reviews.prefix(3)) { review in
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 4) {
                                    Text(review.authorName ?? "Anonymous")
                                        .font(.subheadline)
                                        .bold()
                                    if let rating = review.rating {
                                        Label(String(format: "%.1f", rating), systemImage: "star.fill")
                                            .foregroundColor(.yellow)
                                            .font(.subheadline)
                                    }
                                    if let time = review.relativeTimeDescription {
                                        Text("· \(time)")
                                            .foregroundColor(.secondary)
                                            .font(.caption)
                                    }
                                }
                                if let text = review.text, !text.isEmpty {
                                    Text("“\(text.prefix(120))\(text.count > 120 ? "..." : "")”")
                                        .font(.callout)
                                }
                            }
                            Divider()
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom)
                }
                else {
                    Text("No overview or reviews available for this place.")
                        .foregroundColor(.secondary)
                        .padding(.horizontal)
                        .padding(.bottom)
                }
            }
        }
        .background(Color(.systemBackground))
    }
}

private struct FilterSheetView: View {
    @Binding var filters: DiscoverFilters
    @Environment(\.dismiss) var dismiss
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Sort & Filter")) {
                    Picker("Sort By", selection: $filters.sortBy) {
                        ForEach(DiscoverFilters.SortBy.allCases) { sortBy in
                            Text(sortBy.rawValue).tag(sortBy)
                        }
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Minimum Rating: \(String(format: "%.1f", filters.minRating))")
                        Slider(value: $filters.minRating, in: 0...5, step: 0.5)
                    }
                    .padding(.vertical, 8)
                    Toggle("Open Now", isOn: $filters.onlyOpenNow)
                    Stepper("Max Results: \(filters.maxResults)", value: $filters.maxResults, in: 10...100, step: 10)
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

final class STSGooglePlacesService {
    private let apiKey: String
    init(apiKey: String) { self.apiKey = apiKey }

    func nearbySearch(center: CLLocationCoordinate2D,
                      radius: Double,
                      type: String?,
                      keyword: String?,
                      openNow: Bool) async throws -> [STSPlace] {
        var components = URLComponents(string: "https://maps.googleapis.com/maps/api/place/nearbysearch/json")!
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "key", value: apiKey),
            URLQueryItem(name: "location", value: "\(center.latitude),\(center.longitude)")
        ]
        if openNow {
            queryItems.append(URLQueryItem(name: "opennow", value: "true"))
        }
        if let type = type {
            queryItems.append(URLQueryItem(name: "type", value: type))
            queryItems.append(URLQueryItem(name: "radius", value: String(Int(radius))))
        } else if let keyword = keyword {
            queryItems.append(URLQueryItem(name: "rankby", value: "distance"))
            queryItems.append(URLQueryItem(name: "keyword", value: keyword))
        } else {
            queryItems.append(URLQueryItem(name: "radius", value: String(Int(radius))))
        }
        components.queryItems = queryItems
        let url = components.url!
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let (data, _) = try await URLSession.shared.data(from: url)
        let decoded = try decoder.decode(STSNearbyResponse.self, from: data)
        return decoded.results
    }

    func placeDetails(placeID: String) async throws -> STSPlaceDetails? {
        var components = URLComponents(string: "https://maps.googleapis.com/maps/api/place/details/json")!
        components.queryItems = [
            URLQueryItem(name: "key", value: apiKey),
            URLQueryItem(name: "place_id", value: placeID),
            URLQueryItem(name: "fields", value: "reviews,rating,user_ratings_total,formatted_address,photos,opening_hours,editorial_summary")
        ]
        let url = components.url!
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let (data, _) = try await URLSession.shared.data(from: url)
        let decoded = try decoder.decode(STSPlaceDetailsResponse.self, from: data)
        return decoded.result
    }
}

struct STSNearbyResponse: Decodable {
    let results: [STSPlace]
    let status: String
    let nextPageToken: String?
}
struct STSPlace: Decodable {
    let placeId: String
    let name: String
    let geometry: STSGeometry
    let rating: Double?
    let types: [String]?
    let photos: [STSPhoto]?
    let userRatingsTotal: Int?
}
struct STSGeometry: Decodable {
    let location: STSLocation
}
struct STSLocation: Decodable {
    let lat: Double
    let lng: Double
}
struct STSPlaceDetailsResponse: Decodable {
    let result: STSPlaceDetails?
    let status: String
}
struct STSPlaceDetails: Decodable {
    let rating: Double?
    let userRatingsTotal: Int?
    let reviews: [PlaceReview]?
    let photos: [STSPhoto]?
    let openingHours: STSOpeningHours?
    let editorialSummary: STSEditorialSummary?
}
struct STSEditorialSummary: Decodable {
    let overview: String?
}
struct STSPhoto: Decodable {
    let photoReference: String
}
struct STSOpeningHours: Decodable {
    let openNow: Bool?
    let weekdayText: [String]?
}

struct LocationPermissionView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "location.slash")
                .resizable()
                .scaledToFit()
                .frame(width: 48, height: 48)
                .foregroundColor(.red)
            Text("Location Permission Denied")
                .font(.title2).bold()
            Text("To see places near you, enable location access in Settings > Privacy > Location Services.")
                .multilineTextAlignment(.center)
                .font(.body)
                .foregroundColor(.secondary)
            Spacer().frame(height: 10)
            Button(action: {
                if let appSettings = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(appSettings)
                }
            }) {
                Text("Open Settings")
                    .bold()
                    .padding()
                    .background(Capsule().fill(Color.accentColor))
                    .foregroundColor(.white)
            }
        }
        .padding()
        .background(Color(.systemBackground).opacity(0.95))
        .cornerRadius(18)
        .padding()
    }
}

private struct NotificationBellButton: View {
    let unreadCount: Int
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            ZStack {
                Image(systemName: "bell").imageScale(.large)
                if unreadCount > 0 {
                    Circle()
                        .fill(Color.red)
                        .frame(width: 10, height: 10)
                        .offset(x: 8, y: -8)
                }
            }
        }
    }
}

struct DiscoverView: View {
    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile
    @Binding var showNotifications: Bool
    @EnvironmentObject var appState: AppState

    @State private var cameraPositioniOS16: CustomMapCameraPosition = .region(.defaultRegion)
    @State private var cameraPositioniOS17: MapCameraPosition = .region(.defaultRegion)
    @State private var selectedType: PlaceType = .restaurant
    @State private var selectedPlace: DiscoverPlace?
    @State private var lastRegion: MKCoordinateRegion = .defaultRegion
    @State private var showFilterSheet = false
    @State private var filters = DiscoverFilters()
    @State private var isLoading = false
    @State private var isDetailLoading = false
    @State private var detailSheetPlace: ObservablePlace? = nil

    @StateObject private var locationManager = DiscoverLocationManager()
    @State private var places: [DiscoverPlace] = []

    private let placesService: STSGooglePlacesService
    @State private var fetchTask: Task<Void, Never>?

    init(groupViewModel: GroupViewModel, currentUser: UserProfile, showNotifications: Binding<Bool>) {
        self._groupViewModel = ObservedObject(wrappedValue: groupViewModel)
        self.currentUser = currentUser
        self._showNotifications = showNotifications
        self.placesService = STSGooglePlacesService(apiKey: GOOGLE_PLACES_API_KEY)
    }

    private var filteredPlaces: [DiscoverPlace] {
        var items = places.filter { $0.rating >= filters.minRating }
        switch filters.sortBy {
        case .distance:
            let center = CLLocation(latitude: lastRegion.center.latitude, longitude: lastRegion.center.longitude)
            items.sort {
                let a = CLLocation(latitude: $0.coordinate.latitude, longitude: $0.coordinate.longitude)
                let b = CLLocation(latitude: $1.coordinate.latitude, longitude: $1.coordinate.longitude)
                return a.distance(from: center) < b.distance(from: center)
            }
        case .rating:
            items.sort { $0.rating > $1.rating }
        case .name:
            items.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        }
        if items.count > filters.maxResults {
            items = Array(items.prefix(filters.maxResults))
        }
        return items
    }

    var body: some View {
        NavigationStack {
            ZStack {
                mapView
                VStack(spacing: 0) {
                    filterRow
                    Spacer()
                }
                .padding(.top, 8)
                .padding(.horizontal, 8)
                VStack {
                    Spacer()
                    HStack {
                        CircleIconButton(systemName: "location.fill") { focusOnUser() }
                        Spacer()
                        CircleIconButton(systemName: "line.3.horizontal.decrease.circle.fill") { showFilterSheet = true }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16 + 120)
                }
                VStack(spacing: 8) {
                    Spacer()
                    carouselHeader
                    placesCarousel
                }
                .padding(.bottom, 12)
                if isLoading {
                    ProgressView().padding(.bottom, 180)
                }
                if locationManager.authorizationStatus == .denied || locationManager.authorizationStatus == .restricted {
                    LocationPermissionView()
                        .zIndex(10)
                }
            }
            .navigationTitle("Discover")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .navigationBarTrailing) {
                    NotificationBellButton(unreadCount: appState.unreadNotificationCount) {
                        showNotifications = true
                    }
                }
            }
            .onAppear {
                if locationManager.authorizationStatus == .notDetermined {
                    locationManager.requestAuthorizationAndMaybeStartUpdating()
                }
                updatePlacesForRegion()
            }
            .modifier(CameraChangeModifier(
                cameraPositioniOS16: $cameraPositioniOS16,
                lastRegion: $lastRegion,
                onRegionChanged: { updatePlacesForRegion() }
            ))
            .sheet(item: $detailSheetPlace) { obsPlace in
                DiscoverPlaceDetailSheet(place: obsPlace, isLoading: isDetailLoading)
                    .onAppear {
                        if let selected = selectedPlace,
                           let idx = places.firstIndex(where: { $0.id == selected.id }),
                           !places[idx].detailsLoaded,
                           !isDetailLoading
                        {
                            isDetailLoading = true
                            Task { await loadDetailsForSelectedPlace() }
                        }
                    }
                    .presentationDetents([.medium, .large])
            }
        }
    }

    @ViewBuilder
    private var mapView: some View {
        if #available(iOS 17.0, *) {
            MapReader { _ in
                Map(position: $cameraPositioniOS17) {
                    UserAnnotation()
                    ForEach(filteredPlaces) { place in
                        Annotation("", coordinate: place.coordinate) {
                            PinView(place: place, selected: place.id == selectedPlace?.id)
                                .onTapGesture { handlePlaceTap(place) }
                        }
                    }
                }
                .ignoresSafeArea()
                .onMapCameraChange(frequency: .onEnd) { context in
                    let region = context.region
                    if !regionsAreEqual(region, lastRegion) {
                        lastRegion = region
                        updatePlacesForRegion()
                    }
                }
            }
        } else {
            Map(
                coordinateRegion: Binding(
                    get: { cameraPositioniOS16.regionValue ?? .defaultRegion },
                    set: { newValue in cameraPositioniOS16 = .region(newValue) }
                ),
                interactionModes: .all,
                showsUserLocation: true,
                userTrackingMode: .none,
                annotationItems: filteredPlaces
            ) { place in
                MapAnnotation(coordinate: place.coordinate) {
                    PinView(place: place, selected: place.id == selectedPlace?.id)
                        .onTapGesture { handlePlaceTap(place) }
                }
            }
            .ignoresSafeArea()
        }
    }

    private func handlePlaceTap(_ place: DiscoverPlace) {
        isDetailLoading = true
        selectedPlace = place
        detailSheetPlace = ObservablePlace(from: place)
    }

    private func updatePlacesForRegion() {
        fetchTask?.cancel()
        let region = lastRegion
        let center = region.center
        let radius = approximateRadius(from: region)
        let typeParam = selectedType.googleType
        let keywordParam = selectedType.googleKeyword
        let openNow = filters.onlyOpenNow

        isLoading = true

        fetchTask = Task {
            do {
                let results = try await placesService.nearbySearch(center: center,
                                                                   radius: radius,
                                                                   type: typeParam,
                                                                   keyword: keywordParam,
                                                                   openNow: openNow)
                let mapped: [DiscoverPlace] = results.map { gp in
                    let coord = CLLocationCoordinate2D(latitude: gp.geometry.location.lat, longitude: gp.geometry.location.lng)
                    let photoRefs = (gp.photos ?? []).compactMap { $0.photoReference }
                    return DiscoverPlace(
                        id: UUID(),
                        name: gp.name,
                        coordinate: coord,
                        type: selectedType,
                        rating: gp.rating ?? 0.0,
                        placeID: gp.placeId,
                        photos: photoRefs,
                        userRatingsTotal: gp.userRatingsTotal
                    )
                }
                await MainActor.run {
                    self.places = mapped
                    self.isLoading = false
                }
            } catch is CancellationError {
            } catch {
                await MainActor.run {
                    self.isLoading = false
                }
            }
        }
    }

    private func loadDetailsForSelectedPlace() async {
        guard let selected = selectedPlace else { return }
        do {
            if let details = try await placesService.placeDetails(placeID: selected.placeID) {
                let reviews: [PlaceReview] = details.reviews ?? []
                let overview = details.editorialSummary?.overview
                let photoRefs = (details.photos ?? []).compactMap { $0.photoReference }
                let isOpen = details.openingHours?.openNow
                let openHours = details.openingHours?.weekdayText ?? []
                await MainActor.run {
                    if let idx = places.firstIndex(where: { $0.id == selected.id }) {
                        places[idx].reviews = reviews
                        places[idx].overview = overview
                        places[idx].photos = photoRefs
                        places[idx].isOpen = isOpen
                        places[idx].openHours = openHours
                        places[idx].userRatingsTotal = details.userRatingsTotal
                        places[idx].rating = details.rating ?? places[idx].rating
                        places[idx].detailsLoaded = true
                        selectedPlace = places[idx]
                        detailSheetPlace = nil
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                            detailSheetPlace = ObservablePlace(from: places[idx])
                        }
                    }
                }
            }
        } catch {
            print("Details API FAILED for \(selected.name): \(error)")
        }
        await MainActor.run { self.isDetailLoading = false }
    }

    private var filterRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(PlaceType.allCases) { type in
                    Button {
                        selectedType = type
                        updatePlacesForRegion()
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: type.systemImage)
                            Text(type.displayName)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            Capsule().fill(type == selectedType ? type.color : Color(.systemGray5))
                        )
                        .foregroundColor(type == selectedType ? .white : .primary)
                    }
                }
                Button {
                    showFilterSheet = true
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "slider.horizontal.3")
                        Text("More")
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(Color(.systemGray5)))
                    .foregroundColor(.primary)
                }
            }
            .padding(8)
            .background(.ultraThinMaterial, in: Capsule())
        }
    }

    private var carouselHeader: some View {
        HStack {
            Text("SUGGESTIONS (\(filteredPlaces.count))")
                .font(.footnote.bold())
                .foregroundColor(.secondary)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    private var placesCarousel: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(filteredPlaces) { place in
                    PlaceCard(place: place, isSelected: place.id == selectedPlace?.id)
                        .onTapGesture {
                            handlePlaceTap(place)
                        }
                }
            }
            .padding(.horizontal, 16)
        }
        .frame(height: 120)
        .background(
            LinearGradient(gradient: Gradient(colors: [Color.clear, Color(.systemBackground)]),
                           startPoint: .top, endPoint: .bottom)
                .opacity(0.8)
        )
    }

    private func focusOnUser() {
        switch locationManager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            if let loc = locationManager.userLocation {
                let region = MKCoordinateRegion(center: loc.coordinate,
                                                span: MKCoordinateSpan(latitudeDelta: 0.08, longitudeDelta: 0.08))
                if #available(iOS 17.0, *) {
                    cameraPositioniOS17 = .region(region)
                } else {
                    cameraPositioniOS16 = .region(region)
                }
                lastRegion = region
                updatePlacesForRegion()
            } else {
                locationManager.startUpdating()
            }
        case .notDetermined:
            locationManager.requestAuthorizationAndMaybeStartUpdating()
        case .denied, .restricted:
            // show LocationPermissionView
            break
        @unknown default:
            break
        }
    }


    private struct CircleIconButton: View {
        let systemName: String
        let action: () -> Void
        var body: some View {
            Button(action: action) {
                Image(systemName: systemName)
                    .imageScale(.large)
                    .foregroundColor(.primary)
                    .frame(width: 44, height: 44)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .shadow(radius: 2)
        }
    }

    private struct PinView: View {
        let place: DiscoverPlace
        let selected: Bool
        var body: some View {
            VStack(spacing: 2) {
                Image(systemName: place.type.systemImage)
                    .font(.system(size: selected ? 16 : 14, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(8)
                    .background(Circle().fill(place.type.color))
                    .overlay(
                        Circle().stroke(Color.white, lineWidth: selected ? 3 : 2)
                    )
                    .shadow(radius: selected ? 6 : 4)
                if selected {
                    Text(String(format: "%.1f", place.rating))
                        .font(.caption2.bold())
                        .padding(3)
                        .background(RoundedRectangle(cornerRadius: 4).fill(Color(.systemBackground).opacity(0.9)))
                }
            }
        }
    }

    private struct PlaceCard: View {
        let place: DiscoverPlace
        let isSelected: Bool
        var body: some View {
            HStack(spacing: 10) {
                if let firstPhotoRef = place.photos.first,
                   let url = googlePlacePhotoURL(photoReference: firstPhotoRef) {
                    AsyncImage(url: url) { phase in
                        if let img = phase.image {
                            img.resizable().aspectRatio(contentMode: .fill)
                        } else if phase.error != nil {
                            Color.red
                        } else {
                            ProgressView()
                        }
                    }
                    .frame(width: 36, height: 36)
                    .clipShape(Circle())
                } else {
                    Image(systemName: place.type.systemImage)
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(place.type.color))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(place.name)
                        .font(.subheadline).bold()
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        Image(systemName: "star.fill").foregroundColor(.yellow).font(.caption2)
                        Text(String(format: "%.1f", place.rating))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                Spacer()
            }
            .padding(12)
            .frame(width: 240, height: 100)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.08), radius: 4, x: 0, y: 2)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 2)
            )
        }
    }

    struct CameraChangeModifier: ViewModifier {
        @Binding var cameraPositioniOS16: CustomMapCameraPosition
        @Binding var lastRegion: MKCoordinateRegion
        var onRegionChanged: () -> Void

        func body(content: Content) -> some View {
            if #available(iOS 17.0, *) {
                content
            } else {
                content.onChange(of: cameraPositioniOS16) { newValue in
                    switch newValue {
                    case let .region(region):
                        if !regionsAreEqual(region, lastRegion) {
                            lastRegion = region
                            onRegionChanged()
                        }
                    }
                }
            }
        }
    }
}
