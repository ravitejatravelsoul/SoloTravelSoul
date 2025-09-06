import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var phone = ""
    @State private var birthday = ""
    @State private var gender = ""
    @State private var country = ""
    @State private var city = ""
    @State private var bio = ""
    @State private var preferences = ""
    @State private var favoriteDestinations = ""
    @State private var languages = ""
    @State private var emergencyContact = ""
    @State private var socialLinks = ""
    @State private var privacyEnabled = false
    @State private var showSignUp = false
    @State private var errorMsg: String?

    // Helper to convert comma-separated to [String] array
    private func csvToArray(_ csv: String) -> [String] {
        csv.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    var body: some View {
        VStack(spacing: 16) {
            Text(showSignUp ? "Sign Up" : "Login")
                .font(.title)
                .bold()
            TextField("Email", text: $email)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .textContentType(.emailAddress)
                .padding(8)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(8)
            SecureField("Password", text: $password)
                .padding(8)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(8)
            if showSignUp {
                Group {
                    TextField("Name", text: $name)
                    TextField("Phone", text: $phone)
                    TextField("Birthday", text: $birthday)
                    TextField("Gender", text: $gender)
                    TextField("Country", text: $country)
                    TextField("City", text: $city)
                    TextField("Bio", text: $bio)
                    TextField("Preferences (comma separated)", text: $preferences)
                    TextField("Favorite Destinations", text: $favoriteDestinations)
                    TextField("Languages", text: $languages)
                    TextField("Emergency Contact", text: $emergencyContact)
                    TextField("Social Links", text: $socialLinks)
                    Toggle("Privacy Enabled", isOn: $privacyEnabled)
                }
                .padding(8)
                .background(Color(.secondarySystemBackground))
                .cornerRadius(8)
            }
            Button(showSignUp ? "Sign Up" : "Login") {
                if showSignUp {
                    authViewModel.signUp(
                        email: email,
                        password: password,
                        name: name,
                        phone: phone,
                        birthday: birthday,
                        gender: gender,
                        country: country,
                        city: city,
                        bio: bio,
                        preferences: csvToArray(preferences),
                        favoriteDestinations: csvToArray(favoriteDestinations),
                        languages: csvToArray(languages),
                        emergencyContact: emergencyContact,
                        socialLinks: socialLinks,
                        privacyEnabled: privacyEnabled
                    ) { success in
                        if !success {
                            errorMsg = authViewModel.errorMessage ?? "Unknown error."
                        }
                    }
                } else {
                    authViewModel.signIn(email: email, password: password) { success in
                        if !success {
                            errorMsg = authViewModel.errorMessage ?? "Unknown error."
                        }
                    }
                }
            }
            .padding()
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(8)

            Button(showSignUp ? "Have an account? Login" : "No account? Sign Up") {
                showSignUp.toggle()
            }
            if let msg = errorMsg {
                Text(msg).foregroundColor(.red)
            }
        }
        .padding()
    }
}
