//
// DiscoverView.swift
// (copy/paste this entire file into your project)
//

import Foundation
import SwiftUI
import MapKit
import CoreLocation

private let GOOGLE_PLACES_API_KEY = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU"

// MARK: - Photo URL helper
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

// MARK: - PlaceType
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

// MARK: - DiscoverPlace model
struct DiscoverPlace: Identifiable, Equatable {
    let id: UUID
    let name: String
    let coordinate: CLLocationCoordinate2D
    let type: PlaceType
    var rating: Double
    let placeID: String
    var isOpen: Bool?
    var openHours: [String] = []
    var formattedAddress: String?
    var photos: [String] = []
    var reviews: [PlaceReview] = []
    var userRatingsTotal: Int? = nil
    var detailsLoaded: Bool = false

    static func == (lhs: DiscoverPlace, rhs: DiscoverPlace) -> Bool { lhs.id == rhs.id }
}

// Observable wrapper for the sheet
final class ObservablePlace: ObservableObject, Identifiable {
    @Published var id: UUID
    @Published var name: String
    @Published var coordinate: CLLocationCoordinate2D
    @Published var type: PlaceType
    @Published var rating: Double
    @Published var placeID: String
    @Published var isOpen: Bool?
    @Published var openHours: [String]
    @Published var formattedAddress: String?
    @Published var photos: [String]
    @Published var reviews: [PlaceReview]
    @Published var userRatingsTotal: Int?
    @State private var fetchTask: Task<Void, Never>? = nil


    init(from place: DiscoverPlace) {
        self.id = place.id
        self.name = place.name
        self.coordinate = place.coordinate
        self.type = place.type
        self.rating = place.rating
        self.placeID = place.placeID
        self.isOpen = place.isOpen
        self.openHours = place.openHours
        self.formattedAddress = place.formattedAddress
        self.photos = place.photos
        self.reviews = place.reviews
        self.userRatingsTotal = place.userRatingsTotal
    }

    func update(from place: DiscoverPlace) {
        guard place.id == self.id else { return }
        self.isOpen = place.isOpen
        self.openHours = place.openHours
        self.formattedAddress = place.formattedAddress
        self.photos = place.photos
        self.reviews = place.reviews
        self.rating = place.rating
        self.userRatingsTotal = place.userRatingsTotal
    }
}

// MARK: - Map helpers
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

// MARK: - Filters
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

// MARK: - PLACE DETAILS SHEET
private struct DiscoverPlaceDetailSheet: View {
    @ObservedObject var place: ObservablePlace
    @State private var isShareSheetPresented = false
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

    private var todayHours: String? {
        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: Date())
        // Google weekdayText is Mon..Sun starting index 0, Calendar.weekday gives Sun=1..Sat=7
        // Convert Sunday=1 -> index 6, Monday=2 -> index 0, etc.
        let adjusted: Int
        if weekday == 1 { adjusted = 6 } else { adjusted = weekday - 2 }
        if place.openHours.indices.contains(adjusted) {
            return place.openHours[adjusted]
        }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Photo
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
                            placeholderImage
                        @unknown default:
                            EmptyView()
                        }
                    }
                    .frame(height: 220)
                    .clipped()
                    .cornerRadius(16)
                    .padding(.horizontal)
                } else {
                    placeholderImage
                        .frame(height: 220)
                        .cornerRadius(16)
                        .padding(.horizontal)
                }

                // Title + rating
                VStack(alignment: .leading, spacing: 8) {
                    Text(place.name)
                        .font(.title2).bold()
                        .lineLimit(2)

                    HStack(spacing: 10) {
                        Label(averageRatingText, systemImage: "star.fill")
                            .foregroundColor(.yellow)
                            .font(.headline)
                        Text(reviewsCountText)
                            .foregroundColor(.secondary)
                            .font(.subheadline)
                    }
                }
                .padding(.horizontal)

                // Modern "Open in Maps" card (kept & improved UI)
                Button(action: {
                    openInMaps(address: place.formattedAddress ?? place.name,
                               latitude: place.coordinate.latitude,
                               longitude: place.coordinate.longitude)
                }) {
                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(LinearGradient(
                                    gradient: Gradient(colors: [.blue, .green]),
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ))
                                .frame(width: 44, height: 44)

                            Image(systemName: "location.north.fill")
                                .foregroundColor(.white)
                                .font(.system(size: 18, weight: .semibold))
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Open in Maps")
                                .font(.headline)
                                .foregroundColor(.primary)
                            if let addr = place.formattedAddress {
                                Text(addr)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .lineLimit(2)
                            }
                        }

                        Spacer()

                        Image(systemName: "arrow.up.right.square")
                            .foregroundColor(.blue)
                    }
                    .padding()
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color(.systemBackground))
                            .shadow(color: Color.black.opacity(0.06), radius: 6, x: 0, y: 2)
                    )
                }
                .padding(.horizontal)

                // Open Now / Today's hours
                Group {
                    if let openNow = place.isOpen {
                        HStack(spacing: 8) {
                            Image(systemName: openNow ? "clock.badge.checkmark" : "clock.badge.xmark")
                                .foregroundColor(openNow ? .green : .red)
                            Text(openNow ? "Open Now" : "Closed")
                                .foregroundColor(openNow ? .green : .red)
                                .font(.subheadline)
                            if let hours = todayHours {
                                Text("· \(hours)")
                                    .foregroundColor(.secondary)
                                    .font(.subheadline)
                            }
                        }
                        .padding(.horizontal)
                    } else if let hours = todayHours {
                        HStack(spacing: 8) {
                            Image(systemName: "clock")
                            Text(hours)
                                .foregroundColor(.secondary)
                                .font(.subheadline)
                        }
                        .padding(.horizontal)
                    }
                }

                // Share button
                Button(action: { isShareSheetPresented = true }) {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .font(.headline)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .background(Color(.systemGray6))
                        .cornerRadius(10)
                }
                .padding(.horizontal)
                .sheet(isPresented: $isShareSheetPresented) {
                    if let url = URL(string: "https://maps.apple.com/?q=\(place.name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&ll=\(place.coordinate.latitude),\(place.coordinate.longitude)") {
                        ShareSheet(activityItems: [url])
                    }
                }

                Divider().padding(.vertical, 12)

                // Recent reviews (if available)
                if !place.reviews.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recent Reviews")
                            .font(.headline)
                            .padding(.horizontal)

                        ForEach(place.reviews.prefix(4)) { rev in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(rev.authorName ?? "Anonymous")
                                        .font(.subheadline).bold()
                                    Spacer()
                                    if let r = rev.rating {
                                        Label(String(format: "%.1f", r), systemImage: "star.fill")
                                            .foregroundColor(.yellow)
                                            .font(.caption)
                                    }
                                }
                                if let text = rev.text {
                                    Text(text)
                                        .font(.callout)
                                        .foregroundColor(.primary)
                                }
                                if let relative = rev.relativeTimeDescription {
                                    Text(relative).font(.caption2).foregroundColor(.secondary)
                                }
                            }
                            .padding(.horizontal)
                            Divider()
                        }
                    }
                }

                Spacer().frame(height: 20)
            } // VStack
            .padding(.top)
        } // ScrollView
        .background(Color(.systemBackground))
    }

    private var placeholderImage: some View {
        ZStack {
            Color.gray.opacity(0.1)
            Image(systemName: place.type.systemImage)
                .font(.largeTitle)
                .foregroundColor(.gray)
        }
    }

    private func openInMaps(address: String, latitude: Double, longitude: Double) {
        let encoded = address.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let googleMapsURL = URL(string: "comgooglemaps://?q=\(encoded)&center=\(latitude),\(longitude)&zoom=14"),
           UIApplication.shared.canOpenURL(googleMapsURL) {
            UIApplication.shared.open(googleMapsURL)
        } else if let appleMapsURL = URL(string: "http://maps.apple.com/?ll=\(latitude),\(longitude)&q=\(encoded)") {
            UIApplication.shared.open(appleMapsURL)
        }
    }
}

// MARK: - Filter sheet
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
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - ShareSheet wrapper
struct ShareSheet: UIViewControllerRepresentable {
    var activityItems: [Any]
    var applicationActivities: [UIActivity]? = nil

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: applicationActivities)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Google Places service + decoding
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

// Decodable structs
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
    let formattedAddress: String?
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

// MARK: - Location permission view & notification bell
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

// MARK: - DISCOVER VIEW (main)
struct DiscoverView: View {
    // replace these types with your own concrete types in your project
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
    @State private var cameraPosition: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194), // Default: San Francisco
            span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
        )
    )
    init(groupViewModel: GroupViewModel, currentUser: UserProfile, showNotifications: Binding<Bool>) {
        self._groupViewModel = ObservedObject(wrappedValue: groupViewModel)
        self.currentUser = currentUser
        self._showNotifications = showNotifications
        self.placesService = STSGooglePlacesService(apiKey: GOOGLE_PLACES_API_KEY)
    }
    
    // filter/sort result
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
                
                // Controls row bottom-right and bottom-left
                VStack {
                    Spacer()
                    HStack {
                        // Current location button (triangle style you mentioned)
                        Button(action: {
                            if let location = locationManager.userLocation {
                                cameraPosition = .region(
                                    MKCoordinateRegion(
                                        center: location.coordinate,
                                        span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
                                    )
                                )
                            } else {
                                locationManager.requestAuthorizationAndMaybeStartUpdating()
                            }
                            focusOnUser(animated: true)
                        }) {
                            Image(systemName: "location.fill")
                                    .font(.system(size: 20, weight: .semibold))
                                    .foregroundColor(.blue)
                                    .frame(width: 44, height: 44)
                                    .background(Color(.systemBackground))
                                    .clipShape(Circle())
                                    .shadow(color: Color.black.opacity(0.15), radius: 4, x: 0, y: 2)
                        }
                        .padding()
                        
                        Spacer()
                        
                        CircleIconButton(systemName: "line.3.horizontal.decrease.circle.fill") {
                            showFilterSheet = true
                        }
                        .padding(.trailing, 16)
                    }
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
    
    // MARK: Map view builder
    @ViewBuilder
    private var mapView: some View {
        if #available(iOS 17.0, *) {
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
    
    // MARK: Actions
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
                // canceled
            } catch {
                await MainActor.run {
                    self.isLoading = false
                }
                print("Nearby search failed: \(error)")
            }
        }
    }
    
    private func loadDetailsForSelectedPlace() async {
        guard let selected = selectedPlace else { return }
        do {
            if let details = try await placesService.placeDetails(placeID: selected.placeID) {
                let reviews: [PlaceReview] = details.reviews ?? []
                let photoRefs = (details.photos ?? []).compactMap { $0.photoReference }
                let isOpen = details.openingHours?.openNow
                let openHours = details.openingHours?.weekdayText ?? []
                let address = details.formattedAddress
                
                await MainActor.run {
                    if let idx = places.firstIndex(where: { $0.id == selected.id }) {
                        places[idx].reviews = reviews
                        places[idx].photos = photoRefs
                        places[idx].isOpen = isOpen
                        places[idx].openHours = openHours
                        places[idx].formattedAddress = address
                        places[idx].userRatingsTotal = details.userRatingsTotal
                        places[idx].rating = details.rating ?? places[idx].rating
                        places[idx].detailsLoaded = true
                        
                        selectedPlace = places[idx]
                        detailSheetPlace = nil
                        // Slight delay so sheet's ObservablePlace is constructed with updated fields
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
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
    
    // MARK: UI parts
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
    
    // Recenter to user location with optional animation
    private func focusOnUser(animated: Bool = false) {
        switch locationManager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            if let loc = locationManager.userLocation {
                let region = MKCoordinateRegion(
                    center: loc.coordinate,
                    span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
                )

                // update map camera for the currently used API
                if animated {
                    withAnimation(.easeInOut) {
                        if #available(iOS 17.0, *) {
                            cameraPositioniOS17 = .region(region)
                        } else {
                            cameraPositioniOS16 = .region(region)
                        }
                    }
                } else {
                    if #available(iOS 17.0, *) {
                        cameraPositioniOS17 = .region(region)
                    } else {
                        cameraPositioniOS16 = .region(region)
                    }
                }

                // keep lastRegion in sync (used for nearby search)
                lastRegion = region

                // refresh places for the new region
                updatePlacesForRegion()
            } else {
                // we have permission but no location yet; start updates
                locationManager.startUpdating()
            }

        case .notDetermined:
            locationManager.requestAuthorizationAndMaybeStartUpdating()
        case .denied, .restricted:
            // permission denied — UI already handles this via LocationPermissionView
            break
        @unknown default:
            break
        }
    }
    
    // MARK: small components
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
