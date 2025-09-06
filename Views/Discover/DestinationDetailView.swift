import SwiftUI
import MapKit

struct DestinationDetailView: View {
    let place: Place
    @ObservedObject var groupViewModel: GroupViewModel
    let currentUser: UserProfile
    @Environment(\.presentationMode) private var presentationMode
    @EnvironmentObject private var authViewModel: AuthViewModel

    @State private var showCreateGroupSheet = false
    @State private var selectedGroup: GroupTrip? = nil

    private var filteredGroups: [GroupTrip] {
        groupViewModel.groups.filter {
            $0.destination
                .lowercased()
                .trimmingCharacters(in: .whitespacesAndNewlines)
            ==
            place.name
                .lowercased()
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                headerImage

                Text(place.name)
                    .font(.largeTitle)
                    .fontWeight(.bold)

                if let address = place.address, !address.isEmpty {
                    Text(address)
                        .font(.title3)
                        .foregroundColor(.secondary)
                }

                if let types = place.types, !types.isEmpty {
                    Text(types.joined(separator: ", "))
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .padding(.top, 4)
                }

                if let rating = place.rating {
                    HStack(spacing: 4) {
                        Image(systemName: "star.fill")
                            .foregroundColor(.yellow)
                        Text(String(format: "%.1f", rating))
                            .font(.headline)
                    }
                }

                tripGroupsSection
                Spacer(minLength: 24)
            }
            .padding()
        }
        .navigationTitle("Destination Details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { presentationMode.wrappedValue.dismiss() }
            }
        }
        .sheet(isPresented: $showCreateGroupSheet) {
            CreateGroupForDestinationSheet(
                groupViewModel: groupViewModel,
                prefillDestination: place.name
            )
            .environmentObject(authViewModel)
        }
        .sheet(item: $selectedGroup) { group in
            GroupDetailView(groupViewModel: groupViewModel, group: group)
                .environmentObject(authViewModel)
        }
    }

    // MARK: - Header Image
    @ViewBuilder
    private var headerImage: some View {
        if let photoRef = place.photoReferences?.first,
           let url = googlePlacePhotoURL(photoReference: photoRef, maxWidth: 600) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                case .failure:
                    Color.gray.opacity(0.3)
                        .overlay(Text("Image Error").foregroundColor(.secondary))
                default:
                    Color.gray.opacity(0.15)
                        .overlay(ProgressView())
                }
            }
            .frame(height: 220)
            .clipped()
            .cornerRadius(16)
        } else {
            Rectangle()
                .fill(Color.gray.opacity(0.3))
                .frame(height: 220)
                .cornerRadius(16)
                .overlay(Text("No Image").foregroundColor(.secondary))
        }
    }

    // MARK: - Trip Groups Section
    private var tripGroupsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Trip Groups")
                .font(.title2)
                .bold()
                .padding(.top, 8)

            if filteredGroups.isEmpty {
                Text("No groups for this destination yet.")
                    .foregroundColor(.secondary)
                    .padding(.vertical, 4)

                Button {
                    showCreateGroupSheet = true
                } label: {
                    Label("Create Group", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            } else {
                ForEach(filteredGroups) { group in
                    Button {
                        selectedGroup = group
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(group.name)
                                        .font(.headline)
                                        .lineLimit(1)
                                    if group.creator.id == currentUser.id {
                                        Image(systemName: "crown.fill")
                                            .foregroundColor(.yellow)
                                            .font(.caption)
                                    } else if group.members.contains(where: { $0.id == currentUser.id }) {
                                        Image(systemName: "checkmark.seal.fill")
                                            .foregroundColor(.green)
                                            .font(.caption)
                                    } else if group.requests.contains(where: { $0.id == currentUser.id }) ||
                                                group.joinRequests.contains(currentUser.id) {
                                        Image(systemName: "hourglass")
                                            .foregroundColor(.orange)
                                            .font(.caption)
                                    }
                                }
                                Text("\(group.startDate, style: .date) - \(group.endDate, style: .date)")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                if let desc = group.description, !desc.isEmpty {
                                    Text(desc)
                                        .font(.caption2)
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
                    .buttonStyle(.plain)
                }

                Button {
                    showCreateGroupSheet = true
                } label: {
                    Label("Create Another Group", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .padding(.top, 4)
            }
        }
    }
}

// MARK: - Google Photo Helper
fileprivate func googlePlacePhotoURL(photoReference: String, maxWidth: Int = 600) -> URL? {
    let apiKey = "YOUR_GOOGLE_PLACES_KEY" // TODO: secure
    var components = URLComponents(string: "https://places.googleapis.com/v1/\(photoReference)/media")
    components?.queryItems = [
        URLQueryItem(name: "key", value: apiKey),
        URLQueryItem(name: "maxWidthPx", value: "\(maxWidth)")
    ]
    return components?.url
}

// MARK: - Destination-Specific Group Creation Sheet (renamed to avoid collision)
struct CreateGroupForDestinationSheet: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var authViewModel: AuthViewModel
    @ObservedObject var groupViewModel: GroupViewModel

    let prefillDestination: String

    @State private var name = ""
    @State private var destination = ""
    @State private var startDate = Date()
    @State private var endDate = Calendar.current.date(byAdding: .day, value: 2, to: Date())!
    @State private var descriptionText = ""
    @State private var activitiesText = ""
    @State private var creating = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Basics") {
                    TextField("Group Name", text: $name)
                    TextField("Destination", text: $destination)
                }
                Section("Dates") {
                    DatePicker("Start", selection: $startDate, displayedComponents: .date)
                    DatePicker("End", selection: $endDate, in: startDate..., displayedComponents: .date)
                }
                Section("Description") {
                    TextEditor(text: $descriptionText)
                        .frame(height: 100)
                }
                Section("Activities (comma separated)") {
                    TextField("e.g. Hiking, Museums", text: $activitiesText)
                }
            }
            .disabled(creating)
            .navigationTitle("New Group")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(creating)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        guard
                            !name.trimmingCharacters(in: .whitespaces).isEmpty,
                            !destination.trimmingCharacters(in: .whitespaces).isEmpty,
                            let creator = authViewModel.profile ?? authViewModel.currentUserProfile
                        else { return }
                        creating = true
                        let activities = activitiesText
                            .split(separator: ",")
                            .map { $0.trimmingCharacters(in: .whitespaces) }
                        groupViewModel.createGroup(
                            name: name,
                            destination: destination,
                            startDate: startDate,
                            endDate: endDate,
                            description: descriptionText.isEmpty ? nil : descriptionText,
                            activities: activities,
                            creator: creator
                        )
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                            creating = false
                            dismiss()
                        }
                    } label: {
                        if creating {
                            ProgressView()
                        } else {
                            Label("Create", systemImage: "checkmark")
                        }
                    }
                    .disabled(
                        name.trimmingCharacters(in: .whitespaces).isEmpty ||
                        destination.trimmingCharacters(in: .whitespaces).isEmpty
                    )
                }
            }
            .onAppear {
                if destination.isEmpty {
                    destination = prefillDestination
                }
            }
        }
    }
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
            photoReferences: ["places/SomePhotoRef"],
            reviews: [],
            openingHours: nil,
            phoneNumber: "+33 1 23 45 67 89",
            website: "https://en.parisinfo.com/",
            journalEntries: []
        )
    }
}

struct DestinationDetailView_Previews: PreviewProvider {
    static var previews: some View {
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
            preferences: ["Food", "Art"],
            favoriteDestinations: ["Paris", "Rome"],
            languages: ["English", "French"],
            emergencyContact: "123456789",
            socialLinks: "@alice",
            privacyEnabled: false
        )
        DestinationDetailView(
            place: Place.mock(),
            groupViewModel: GroupViewModel(),
            currentUser: mockUser
        )
        .environmentObject(AuthViewModel())
    }
}
#endif
