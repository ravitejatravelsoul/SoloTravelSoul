import SwiftUI

struct SignupForm: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var phone = ""
    @State private var birthday = ""
    @State private var gender = ""
    @State private var country = ""
    @State private var city = ""
    @State private var bio = ""
    @State private var preferences = ""
    @State private var socialLinks = ""
    @State private var favoriteDestinations = ""
    @State private var languages = ""
    @State private var emergencyContact = ""
    @State private var privacyEnabled = false

    var isFormValid: Bool {
        !name.isEmpty && !email.isEmpty && !password.isEmpty && password == confirmPassword
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Text("Sign Up")
                    .font(.title2)
                    .bold()
                TextField("Name", text: $name)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                SecureField("Password", text: $password)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                SecureField("Confirm Password", text: $confirmPassword)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("Phone", text: $phone)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("Birthday", text: $birthday)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("Gender", text: $gender)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("Country", text: $country)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("City", text: $city)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("Bio", text: $bio)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("Preferences (comma separated)", text: $preferences)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("Favorite Destinations (comma separated)", text: $favoriteDestinations)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("Languages (comma separated)", text: $languages)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("Social Links (comma separated)", text: $socialLinks)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("Emergency Contact", text: $emergencyContact)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                Toggle("Privacy Enabled", isOn: $privacyEnabled)
                if let error = authViewModel.errorMessage {
                    Text(error).foregroundColor(.red)
                }
                Button("Sign Up") {
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
                        preferences: preferences,
                        favoriteDestinations: favoriteDestinations,  // <-- moved before socialLinks!
                        languages: languages,
                        emergencyContact: emergencyContact,
                        socialLinks: socialLinks,                   // <-- now after favoriteDestinations
                        privacyEnabled: privacyEnabled
                    ) { success in
                        // Do nothing; view will update on login state change
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!isFormValid)
                if authViewModel.isLoading {
                    ProgressView()
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
            .shadow(radius: 4)
            .padding()
        }
    }
}
