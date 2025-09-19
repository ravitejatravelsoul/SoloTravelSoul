import SwiftUI
import Foundation

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

    /// Validate the email address using a simple regular expression.
    private func isEmailValid(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        return NSPredicate(format: "SELF MATCHES %@", emailRegex).evaluate(with: email)
    }

    /// Validate password length. Adjust the minimum length as required.
    private var isPasswordLengthValid: Bool {
        password.count >= 6
    }

    /// Validate phone numbers by checking the number of digits (minimum 7).
    private func isPhoneValid(_ phone: String) -> Bool {
        let digits = phone.filter { $0.isNumber }
        return digits.count >= 7
    }

    /// Computed property determining whether the form is ready for submission.
    var isFormValid: Bool {
        return !name.isEmpty &&
               isEmailValid(email) &&
               isPasswordLengthValid &&
               isPhoneValid(phone) &&
               password == confirmPassword
    }

    // Helper to convert comma separated to array
    private func csvToArray(_ csv: String) -> [String] {
        csv.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    var body: some View {
        ScrollView {
            ThemedCard {
                VStack(spacing: 16) {
                    // Title
                    Text("Sign Up")
                        .font(.title2)
                        .bold()
                        .foregroundColor(AppTheme.primary)

                    // Input fields with themed components
                    ThemedTextField(text: $name, placeholder: "Name")
                    ThemedTextField(text: $email, placeholder: "Email", keyboardType: .emailAddress)
                    ThemedSecureField(text: $password, placeholder: "Password")
                    ThemedSecureField(text: $confirmPassword, placeholder: "Confirm Password")
                    ThemedTextField(text: $phone, placeholder: "Phone")
                    ThemedTextField(text: $birthday, placeholder: "Birthday")
                    ThemedTextField(text: $gender, placeholder: "Gender")
                    ThemedTextField(text: $country, placeholder: "Country")
                    ThemedTextField(text: $city, placeholder: "City")
                    ThemedTextField(text: $bio, placeholder: "Bio")
                    ThemedTextField(text: $preferences, placeholder: "Preferences (comma separated)")
                    ThemedTextField(text: $favoriteDestinations, placeholder: "Favorite Destinations (comma separated)")
                    ThemedTextField(text: $languages, placeholder: "Languages (comma separated)")
                    ThemedTextField(text: $socialLinks, placeholder: "Social Links (comma separated)")
                    ThemedTextField(text: $emergencyContact, placeholder: "Emergency Contact")

                    // Privacy toggle
                    Toggle("Privacy Enabled", isOn: $privacyEnabled)

                    // Error messages from view model
                    if let error = authViewModel.errorMessage {
                        Text(error)
                            .foregroundColor(.red)
                    }
                    // Local validation errors
                    if !isEmailValid(email) && !email.isEmpty {
                        Text("Please enter a valid email address")
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                    if !isPasswordLengthValid && !password.isEmpty {
                        Text("Password must be at least 6 characters")
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                    if password != confirmPassword && !confirmPassword.isEmpty {
                        Text("Passwords do not match")
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                    if !isPhoneValid(phone) && !phone.isEmpty {
                        Text("Please enter a valid phone number")
                            .foregroundColor(.red)
                            .font(.caption)
                    }

                    // Submit button
                    ThemedButton(isDisabled: !isFormValid) {
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
                        ) { _ in }
                    } label: {
                        Text("Sign Up")
                    }

                    // Loading indicator
                    if authViewModel.isLoading {
                        ProgressView()
                    }
                }
            }
        }
        .background(AppTheme.background)
    }
}
