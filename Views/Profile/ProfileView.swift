import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    @AppStorage("name") var name: String = ""
    @AppStorage("email") var email: String = ""
    @AppStorage("phone") var phone: String = ""
    @AppStorage("birthday") var birthday: String = ""
    @AppStorage("gender") var gender: String = ""
    @AppStorage("country") var country: String = ""
    @AppStorage("city") var city: String = ""
    @AppStorage("bio") var bio: String = ""
    @AppStorage("preferences") var preferences: String = ""
    @AppStorage("socialLinks") var socialLinks: String = ""
    @AppStorage("favoriteDestinations") var favoriteDestinations: String = ""
    @AppStorage("languages") var languages: String = ""
    @AppStorage("emergencyContact") var emergencyContact: String = ""
    @AppStorage("privacyEnabled") var privacyEnabled: Bool = false
    @AppStorage("profileImageData") var profileImageData: Data = Data()

    @State private var showEdit = false
    @State private var showLogoutConfirm = false

    func listString(_ value: String) -> String {
        value.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.joined(separator: ", ")
    }

    var avatarImage: Image {
        if let uiImage = UIImage(data: profileImageData), !profileImageData.isEmpty {
            return Image(uiImage: uiImage)
        } else {
            return Image(systemName: "person.crop.circle.fill")
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                avatarImage
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 110, height: 110)
                    .clipShape(Circle())
                    .shadow(radius: 6)

                Text(name.isEmpty ? "Your Name" : name)
                    .font(.title2)
                    .bold()
                Text(email.isEmpty ? "your@email.com" : email)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Group {
                    HStack { Text("Phone:"); Spacer(); Text(phone) }
                    HStack { Text("Birthday:"); Spacer(); Text(birthday) }
                    HStack { Text("Gender:"); Spacer(); Text(gender) }
                    HStack { Text("Country:"); Spacer(); Text(country) }
                    HStack { Text("City:"); Spacer(); Text(city) }
                }.padding(.horizontal)

                Text("Bio: \(bio)")
                    .padding(.horizontal)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Preferences: \(listString(preferences))")
                    .padding(.horizontal)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Favorite Destinations: \(listString(favoriteDestinations))")
                    .padding(.horizontal)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Languages: \(listString(languages))")
                    .padding(.horizontal)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Emergency Contact: \(emergencyContact)")
                    .padding(.horizontal)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Social Links: \(socialLinks)")
                    .padding(.horizontal)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack {
                    Image(systemName: privacyEnabled ? "lock.shield.fill" : "lock.open")
                        .foregroundColor(privacyEnabled ? .green : .gray)
                    Text(privacyEnabled ? "Privacy Enabled" : "Privacy Disabled")
                        .foregroundColor(privacyEnabled ? .green : .gray)
                }
                .padding(.horizontal)

                Button(action: { showEdit = true }) {
                    Label("Edit Profile", systemImage: "pencil")
                        .font(.headline)
                        .padding()
                        .background(Color.blue.opacity(0.08))
                        .cornerRadius(8)
                }
                .sheet(isPresented: $showEdit) {
                    EditProfileView()
                        .environmentObject(authViewModel)
                }

                Button(action: {
                    showLogoutConfirm = true
                }) {
                    Label("Log Out", systemImage: "arrow.backward.square")
                        .font(.headline)
                        .padding()
                        .background(Color.red.opacity(0.08))
                        .foregroundColor(.red)
                        .cornerRadius(8)
                }
                .padding(.top, 8)
                .confirmationDialog(
                    "Are you sure you want to log out?",
                    isPresented: $showLogoutConfirm,
                    titleVisibility: .visible
                ) {
                    Button("Log Out", role: .destructive) {
                        authViewModel.signOut()
                    }
                    Button("Cancel", role: .cancel) { }
                }
            }
            .padding()
        }
    }
}
