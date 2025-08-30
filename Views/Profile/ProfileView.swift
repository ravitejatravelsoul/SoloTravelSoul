import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    // Fallback to AppStorage if profile is nil (optional, for backward compatibility)
    @AppStorage("profileImageData") var profileImageData: Data = Data()
    @AppStorage("name") var name: String = ""
    @AppStorage("email") var email: String = ""
    @AppStorage("phone") var phone: String = ""
    @AppStorage("birthday") var birthday: String = ""
    @AppStorage("gender") var gender: String = ""
    @AppStorage("country") var country: String = ""
    @AppStorage("city") var city: String = ""
    @AppStorage("bio") var bio: String = ""
    @AppStorage("preferences") var preferences: String = ""
    @AppStorage("favoriteDestinations") var favoriteDestinations: String = ""
    @AppStorage("languages") var languages: String = ""
    @AppStorage("emergencyContact") var emergencyContact: String = ""
    @AppStorage("socialLinks") var socialLinks: String = ""
    @AppStorage("privacyEnabled") var privacyEnabled: Bool = false

    @State private var showEdit = false

    func listString(_ value: String) -> String {
        value.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.joined(separator: ", ")
    }

    // Helper to get the editable user
    var editableUser: UserProfile {
        if let profile = authViewModel.profile {
            return profile
        } else {
            return UserProfile(
                id: UUID().uuidString,
                name: name,
                email: email,
                phone: phone,
                birthday: birthday,
                gender: gender,
                country: country,
                city: city,
                bio: bio,
                preferences: preferences,
                favoriteDestinations: favoriteDestinations,
                languages: languages,
                emergencyContact: emergencyContact,
                socialLinks: socialLinks,
                privacyEnabled: privacyEnabled,
                photoURL: nil
            )
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Profile Picture
                if let profile = authViewModel.profile {
                    UserAvatarView(user: profile, size: 110)
                        .shadow(radius: 6)
                } else {
                    // Fallback to AppStorage-based avatar
                    if let uiImage = UIImage(data: profileImageData), !profileImageData.isEmpty {
                        Image(uiImage: uiImage)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 110, height: 110)
                            .clipShape(Circle())
                            .shadow(radius: 6)
                    } else {
                        Image(systemName: "person.crop.circle.fill")
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 110, height: 110)
                            .clipShape(Circle())
                            .shadow(radius: 6)
                    }
                }

                if let profile = authViewModel.profile {
                    // Name & Email
                    Text(profile.name.isEmpty ? "Your Name" : profile.name)
                        .font(.title2)
                        .bold()
                    Text(profile.email.isEmpty ? "your@email.com" : profile.email)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    // All Editable Fields
                    Group {
                        ProfileRow(title: "Phone", value: profile.phone)
                        ProfileRow(title: "Birthday", value: profile.birthday)
                        ProfileRow(title: "Gender", value: profile.gender)
                        ProfileRow(title: "Country", value: profile.country)
                        ProfileRow(title: "City", value: profile.city)
                        ProfileRow(title: "Bio", value: profile.bio)
                        ProfileRow(title: "Preferences", value: listString(profile.preferences))
                        ProfileRow(title: "Favorite Destinations", value: listString(profile.favoriteDestinations))
                        ProfileRow(title: "Languages", value: listString(profile.languages))
                        ProfileRow(title: "Emergency Contact", value: profile.emergencyContact)
                        ProfileRow(title: "Social Links", value: profile.socialLinks)
                    }
                    .padding(.horizontal)
                    // Privacy Indicator
                    HStack {
                        Image(systemName: profile.privacyEnabled ? "lock.shield.fill" : "lock.open")
                            .foregroundColor(profile.privacyEnabled ? .green : .gray)
                        Text(profile.privacyEnabled ? "Privacy Enabled" : "Privacy Disabled")
                            .foregroundColor(profile.privacyEnabled ? .green : .gray)
                    }
                    .padding(.horizontal)
                    .padding(.top, 8)
                } else {
                    // Fallback to AppStorage values if profile is nil
                    Text(name.isEmpty ? "Your Name" : name)
                        .font(.title2)
                        .bold()
                    Text(email.isEmpty ? "your@email.com" : email)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Group {
                        ProfileRow(title: "Phone", value: phone)
                        ProfileRow(title: "Birthday", value: birthday)
                        ProfileRow(title: "Gender", value: gender)
                        ProfileRow(title: "Country", value: country)
                        ProfileRow(title: "City", value: city)
                        ProfileRow(title: "Bio", value: bio)
                        ProfileRow(title: "Preferences", value: listString(preferences))
                        ProfileRow(title: "Favorite Destinations", value: listString(favoriteDestinations))
                        ProfileRow(title: "Languages", value: listString(languages))
                        ProfileRow(title: "Emergency Contact", value: emergencyContact)
                        ProfileRow(title: "Social Links", value: socialLinks)
                    }
                    .padding(.horizontal)
                    HStack {
                        Image(systemName: privacyEnabled ? "lock.shield.fill" : "lock.open")
                            .foregroundColor(privacyEnabled ? .green : .gray)
                        Text(privacyEnabled ? "Privacy Enabled" : "Privacy Disabled")
                            .foregroundColor(privacyEnabled ? .green : .gray)
                    }
                    .padding(.horizontal)
                    .padding(.top, 8)
                }

                // Edit Profile Button
                Button(action: { showEdit = true }) {
                    Label("Edit Profile", systemImage: "pencil")
                        .font(.headline)
                        .padding()
                        .background(Color.blue.opacity(0.08))
                        .cornerRadius(8)
                }
                .sheet(isPresented: $showEdit) {
                    EditProfileView(
                        user: editableUser,
                        isAvatarOnly: false,
                        onSave: { updatedUser in
                            // handle the updated user here, e.g. update your view model or AppStorage if needed
                            // Example: authViewModel.profile = updatedUser
                        }
                    )
                    .environmentObject(authViewModel)
                }
                // Logout Button REMOVED
                // If you want logout, add it only in a main menu/drawer, not here!
            }
            .padding()
        }
    }
}

struct ProfileRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack(alignment: .top) {
            Text(title)
                .fontWeight(.semibold)
            Spacer()
            Text(value.isEmpty ? "Not Set" : value)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 2)
    }
}
