import SwiftUI

struct HomeGreetingView: View {
    @AppStorage("name") private var name: String = ""
    @AppStorage("profileImageData") private var profileImageData: Data = Data()
    @EnvironmentObject var authViewModel: AuthViewModel

    @State private var showEditProfile = false

    // Create a dummy user profile for demonstration.
    // Replace this with your real user fetching logic as needed.
    var userProfile: UserProfile {
        UserProfile(
            id: UUID().uuidString,
            name: name,
            email: "",
            phone: "",
            birthday: "",
            gender: "",
            country: "",
            city: "",
            bio: "",
            preferences: "",
            favoriteDestinations: "",
            languages: "",
            emergencyContact: "",
            socialLinks: "",
            privacyEnabled: false,
            photoURL: nil
        )
    }

    var avatarImage: Image {
        if let uiImage = UIImage(data: profileImageData), !profileImageData.isEmpty {
            return Image(uiImage: uiImage)
        } else {
            return Image("defaultAvatar")
        }
    }

    var body: some View {
        HStack(spacing: 16) {
            avatarImage
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 60, height: 60)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.accentColor, lineWidth: 2))
                .shadow(radius: 4)

            VStack(alignment: .leading, spacing: 4) {
                Text("Welcome back, \(name.isEmpty ? "Traveler" : name)!")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)

                Text("Ready for your next adventure?")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                HStack(spacing: 12) {
                    Button(action: { showEditProfile = true }) {
                        Label("Edit Profile", systemImage: "pencil")
                    }
                    .font(.caption)
                    .buttonStyle(.bordered)
                    .sheet(isPresented: $showEditProfile) {
                        EditProfileView(
                            user: userProfile,
                            isAvatarOnly: false,
                            onSave: { updatedUser in
                                // You can update your @AppStorage or model here if needed
                                // For example:
                                name = updatedUser.name
                                // Save profile image, etc.
                            }
                        )
                        .environmentObject(authViewModel)
                    }

                    Button(action: {
                        // Settings action
                    }) {
                        Label("Settings", systemImage: "gear")
                    }
                    .font(.caption)
                    .buttonStyle(.bordered)
                }
            }
            Spacer()
        }
        .padding(.horizontal)
        .padding(.top)
    }
}

struct HomeGreetingView_Previews: PreviewProvider {
    static var previews: some View {
        HomeGreetingView()
            .environmentObject(AuthViewModel())
            .previewLayout(.sizeThatFits)
    }
}
