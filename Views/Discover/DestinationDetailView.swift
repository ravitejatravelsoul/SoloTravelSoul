import SwiftUI
import MapKit

struct DestinationDetailView: View {
    let place: Place
    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile
    @Environment(\.presentationMode) var presentationMode

    @State private var showCreateGroupSheet = false
    @State private var selectedGroup: GroupTrip? = nil

    // Filter groups for this destination (case-insensitive, trimmed)
    private var filteredGroups: [GroupTrip] {
        groupViewModel.groups.filter {
            $0.destination.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
            ==
            place.name.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Cover image using photoReferences
                if let photoRef = place.photoReferences?.first,
                   let url = googlePlacePhotoURL(photoReference: photoRef, maxWidth: 600) {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image
                                .resizable()
                                .scaledToFill()
                                .frame(height: 220)
                                .clipped()
                                .cornerRadius(16)
                        } else if phase.error != nil {
                            Color.gray.opacity(0.3)
                                .frame(height: 220)
                                .cornerRadius(16)
                                .overlay(Text("Image Error").foregroundColor(.secondary))
                        } else {
                            Color.gray.opacity(0.15)
                                .frame(height: 220)
                                .cornerRadius(16)
                                .overlay(ProgressView())
                        }
                    }
                } else {
                    Rectangle()
                        .fill(Color.gray.opacity(0.3))
                        .frame(height: 220)
                        .cornerRadius(16)
                        .overlay(Text("No Image").foregroundColor(.secondary))
                }

                // Name
                Text(place.name)
                    .font(.largeTitle)
                    .fontWeight(.bold)

                // Address
                if let address = place.address, !address.isEmpty {
                    Text(address)
                        .font(.title3)
                        .foregroundColor(.secondary)
                }

                // Types (Description)
                if let types = place.types, !types.isEmpty {
                    Text(types.joined(separator: ", "))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .padding(.top, 4)
                }

                // Rating
                if let rating = place.rating {
                    HStack {
                        Image(systemName: "star.fill")
                            .foregroundColor(.yellow)
                        Text(String(format: "%.1f", rating))
                            .font(.headline)
                    }
                }

                // --- Trip Groups Section ---
                tripGroupsSection

                Spacer(minLength: 24)
            }
            .padding()
        }
        .navigationTitle("Destination Details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") {
                    presentationMode.wrappedValue.dismiss()
                }
            }
        }
        .sheet(isPresented: $showCreateGroupSheet) {
            CreateGroupView(
                groupViewModel: groupViewModel,
                currentUser: currentUser,
                prefillDestination: place.name // You should add this param to your CreateGroupView for a better experience!
            )
        }
        .sheet(item: $selectedGroup) { group in
            GroupDetailView(
                group: group,
                currentUser: currentUser,         // <-- swapped order
                groupViewModel: groupViewModel    // <-- swapped order
            )
        }
    }

    // MARK: - Trip Groups Section View
    private var tripGroupsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Trip Groups")
                .font(.title2)
                .bold()
                .padding(.top, 8)

            if filteredGroups.isEmpty {
                Text("No groups for this destination yet.")
                    .foregroundColor(.secondary)
                    .padding(.vertical, 8)
                Button(action: {
                    showCreateGroupSheet = true
                }) {
                    Label("Create Group", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            } else {
                ForEach(filteredGroups) { group in
                    Button(action: {
                        selectedGroup = group
                    }) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(group.name)
                                    .font(.headline)
                                Text("\(group.startDate, style: .date) - \(group.endDate, style: .date)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                if let desc = group.description, !desc.isEmpty {
                                    Text(desc)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                        .lineLimit(1)
                                }
                            }
                            Spacer()
                            Text("\(group.members.count) members")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Image(systemName: "chevron.right")
                                .foregroundColor(.gray)
                        }
                        .padding(8)
                        .background(Color(.systemGray6))
                        .cornerRadius(10)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                Button(action: {
                    showCreateGroupSheet = true
                }) {
                    Label("Create Another Group", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .padding(.top, 4)
            }
        }
    }
}

// Helper for Google Photos API (reuse from your codebase)
fileprivate func googlePlacePhotoURL(photoReference: String, maxWidth: Int = 600) -> URL? {
    let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU"
    var components = URLComponents(string: "https://places.googleapis.com/v1/\(photoReference)/media")
    components?.queryItems = [
        URLQueryItem(name: "key", value: apiKey),
        URLQueryItem(name: "maxWidthPx", value: "\(maxWidth)")
    ]
    return components?.url
}

#if DEBUG
extension Place {
    static func mock() -> Place {
        Place(
            id: "mock1",
            name: "Paris",
            address: "Champs-Élysées, Paris, France",
            latitude: 48.8566,
            longitude: 2.3522,
            types: ["tourist_attraction", "point_of_interest"],
            rating: 4.7,
            userRatingsTotal: 12000,
            photoReferences: ["Aap_uEBQ0V..."],
            reviews: [],
            openingHours: nil,
            phoneNumber: "+33 1 23 45 67 89",
            website: "https://en.parisinfo.com/",
            journalEntries: []
        )
    }
}
#endif

#if DEBUG
struct DestinationDetailView_Previews: PreviewProvider {
    static var previews: some View {
        // Provide mock objects for preview
        let mockUser = UserProfile(
            id: "user1",
            name: "Alice",
            email: "alice@example.com",
            phone: "123456",
            birthday: "2000-01-01",
            gender: "female",
            country: "France",
            city: "Paris",
            bio: "Traveler",
            preferences: "Food, Art",
            favoriteDestinations: "Paris, Rome",
            languages: "English, French",
            emergencyContact: "123456789",
            socialLinks: "@alice",
            privacyEnabled: false
        )
        DestinationDetailView(
            place: Place.mock(),
            groupViewModel: GroupViewModel(),
            currentUser: mockUser
        )
    }
}
#endif
