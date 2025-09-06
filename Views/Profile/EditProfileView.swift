import SwiftUI
import PhotosUI
import FirebaseFirestore

// MARK: - Helper for adding new option values to Firestore
enum ProfileOptionType {
    case preference, destination, language
}

func addOptionToFirestore(type: ProfileOptionType, value: String) {
    let collection: String
    switch type {
        case .preference: collection = "profile_options_preferences"
        case .destination: collection = "profile_options_destinations"
        case .language: collection = "profile_options_languages"
    }
    let db = Firestore.firestore()
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    db.collection(collection).whereField("value", isEqualTo: trimmed).getDocuments { snapshot, error in
        guard let snapshot = snapshot, snapshot.documents.isEmpty else { return }
        db.collection(collection).addDocument(data: ["value": trimmed])
    }
}

// MARK: - EditProfileView
struct EditProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var authViewModel: AuthViewModel
    @ObservedObject private var optionsVM = ProfileOptionsViewModel()

    @State private var profileImageData: Data = Data()
    @State private var name: String
    @State private var email: String
    @State private var phone: String
    @State private var birthday: String
    @State private var gender: String
    @State private var country: String
    @State private var city: String
    @State private var bio: String
    @State private var selectedPreferences: [String]
    @State private var socialLinks: String
    @State private var selectedDestinations: [String]
    @State private var selectedLanguages: [String]
    @State private var emergencyContact: String
    @State private var privacyEnabled: Bool

    @State private var showValidationError = false
    @State private var validationError: String = ""
    @State private var saving = false

    @State private var showImagePicker = false
    @State private var selectedPhoto: PhotosPickerItem? = nil

    let isAvatarOnly: Bool
    var onSave: (UserProfile) -> Void

    init(user: UserProfile, isAvatarOnly: Bool = false, onSave: @escaping (UserProfile) -> Void) {
        _name = State(initialValue: user.name)
        _email = State(initialValue: user.email)
        _phone = State(initialValue: user.phone)
        _birthday = State(initialValue: user.birthday)
        _gender = State(initialValue: user.gender)
        _country = State(initialValue: user.country)
        _city = State(initialValue: user.city)
        _bio = State(initialValue: user.bio)
        _selectedPreferences = State(initialValue: user.preferences)
        _socialLinks = State(initialValue: user.socialLinks)
        _selectedDestinations = State(initialValue: user.favoriteDestinations)
        _selectedLanguages = State(initialValue: user.languages)
        _emergencyContact = State(initialValue: user.emergencyContact)
        _privacyEnabled = State(initialValue: user.privacyEnabled)
        self.isAvatarOnly = isAvatarOnly
        self.onSave = onSave
    }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 30) {
                    profileCard

                    if !isAvatarOnly {
                        Group {
                            SectionHeader(title: "Name", systemImage: "person")
                            EditField(text: $name, placeholder: "Your Name")

                            SectionHeader(title: "Email", systemImage: "envelope")
                            EditField(text: $email, placeholder: "Your Email", keyboardType: .emailAddress)

                            SectionHeader(title: "Phone", systemImage: "phone")
                            EditField(text: $phone, placeholder: "Phone Number", keyboardType: .phonePad)

                            SectionHeader(title: "Birthday", systemImage: "calendar")
                            EditField(text: $birthday, placeholder: "yyyy-MM-dd")

                            SectionHeader(title: "Gender", systemImage: "figure.dress.line.vertical.figure")
                            EditField(text: $gender, placeholder: "Gender")

                            SectionHeader(title: "Country", systemImage: "globe")
                            EditField(text: $country, placeholder: "Country")
                            SectionHeader(title: "City", systemImage: "mappin.and.ellipse")
                            EditField(text: $city, placeholder: "City")

                            SectionHeader(title: "Bio", systemImage: "quote.bubble")
                            VStack {
                                TextEditor(text: $bio)
                                    .frame(height: 80)
                                    .padding(8)
                                    .background(AppTheme.card)
                                    .cornerRadius(12)
                            }
                        }

                        SectionHeader(title: "Preferences", systemImage: "star.circle")
                        ProfileTagDropdownEditor(
                            title: "Preferences",
                            items: $selectedPreferences,
                            suggestions: optionsVM.preferences,
                            optionType: .preference,
                            placeholder: "Add new preference"
                        )

                        SectionHeader(title: "Favorite Destinations", systemImage: "airplane")
                        ProfileTagDropdownEditor(
                            title: "Favorite Destinations",
                            items: $selectedDestinations,
                            suggestions: optionsVM.destinations,
                            optionType: .destination,
                            placeholder: "Add new destination"
                        )

                        SectionHeader(title: "Languages", systemImage: "character.book.closed")
                        ProfileTagDropdownEditor(
                            title: "Languages",
                            items: $selectedLanguages,
                            suggestions: optionsVM.languages,
                            optionType: .language,
                            placeholder: "Add new language"
                        )

                        SectionHeader(title: "Social Media Links", systemImage: "link")
                        EditField(text: $socialLinks, placeholder: "Links (comma separated)")

                        SectionHeader(title: "Emergency Contact", systemImage: "phone.bubble.left")
                        EditField(text: $emergencyContact, placeholder: "Emergency Contact")

                        SectionHeader(title: "Privacy", systemImage: "lock.circle")
                        Toggle("Enable Privacy Mode", isOn: $privacyEnabled)
                            .toggleStyle(SwitchToggleStyle(tint: AppTheme.primary))
                            .padding(.horizontal, 16)
                    }

                    Button(action: saveProfile) {
                        if saving {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                                .padding()
                        } else {
                            Text("Save")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(LinearGradient(
                                    gradient: Gradient(colors: [AppTheme.primary, .purple]),
                                    startPoint: .leading,
                                    endPoint: .trailing)
                                )
                                .foregroundColor(.white)
                                .cornerRadius(14)
                                .shadow(radius: 3)
                        }
                    }
                    .padding(.top, 10)
                    .disabled(saving)
                }
                .padding(.vertical, 10)
            }
            .navigationTitle(isAvatarOnly ? "Edit Profile Photo" : "Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .alert(validationError, isPresented: $showValidationError) {
                Button("OK", role: .cancel) {}
            }
            .onAppear {
                optionsVM.fetchPreferences()
                optionsVM.fetchDestinations()
                optionsVM.fetchLanguages()
            }
            .onChange(of: selectedPhoto) { oldValue, newValue in
                if let newPhoto = newValue {
                    Task {
                        if let data = try? await newPhoto.loadTransferable(type: Data.self) {
                            profileImageData = data
                        }
                    }
                }
            }
        }
    }

    private func saveProfile() {
        if !isAvatarOnly {
            if name.trimmingCharacters(in: .whitespaces).isEmpty {
                validationError = "Name cannot be empty."; showValidationError = true; return
            }
            if !isValidEmail(email) {
                validationError = "Please enter a valid email address."; showValidationError = true; return
            }
            if !isValidPhone(phone) {
                validationError = "Please enter a valid phone number."; showValidationError = true; return
            }
            if birthday.isEmpty {
                validationError = "Birthday must be selected."; showValidationError = true; return
            }
        }

        guard let user = authViewModel.user else {
            validationError = "Not logged in."; showValidationError = true; return
        }
        saving = true

        let imageDataToUpload: Data? = profileImageData.isEmpty ? nil : profileImageData
        authViewModel.updateProfile(
            userID: user.uid,
            name: name,
            phone: phone,
            birthday: birthday,
            gender: gender,
            country: country,
            city: city,
            bio: bio,
            preferences: selectedPreferences,
            favoriteDestinations: selectedDestinations,
            languages: selectedLanguages,
            emergencyContact: emergencyContact,
            socialLinks: socialLinks,
            privacyEnabled: privacyEnabled,
            profileImageData: imageDataToUpload
        ) { success in
            saving = false
            if success, let updatedProfile = authViewModel.profile {
                onSave(updatedProfile)
                dismiss()
            } else {
                validationError = authViewModel.errorMessage ?? "Failed to save profile."
                showValidationError = true
            }
        }
    }

    // MARK: - Profile Card
    var profileCard: some View {
        VStack(spacing: 8) {
            ZStack(alignment: .bottomTrailing) {
                Group {
                    if let uiImage = UIImage(data: profileImageData), !profileImageData.isEmpty {
                        Image(uiImage: uiImage).resizable()
                    } else if let url = URL(string: authViewModel.profile?.photoURL ?? ""), !(authViewModel.profile?.photoURL?.isEmpty ?? true) {
                        AsyncImage(url: url) { phase in
                            if let image = phase.image {
                                image.resizable()
                            } else {
                                Image(systemName: "person.crop.circle.fill")
                                    .resizable()
                                    .foregroundColor(AppTheme.primary)
                            }
                        }
                    } else {
                        Image(systemName: "person.crop.circle.fill")
                            .resizable()
                            .foregroundColor(AppTheme.primary)
                    }
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: 110, height: 110)
                .clipShape(Circle())
                .shadow(radius: 6)
                .overlay(
                    Button {
                        showImagePicker = true
                    } label: {
                        Image(systemName: "camera.fill")
                            .font(.title2)
                            .padding(8)
                            .background(AppTheme.primary)
                            .foregroundColor(.white)
                            .clipShape(Circle())
                            .shadow(radius: 3)
                    }
                    .padding(4),
                    alignment: .bottomTrailing
                )
            }

            if !isAvatarOnly {
                Text(name.isEmpty ? "Your Name" : name)
                    .font(.title2)
                    .bold()
                Text(email.isEmpty ? "your@email.com" : email)
                    .font(.subheadline)
                    .foregroundColor(AppTheme.textSecondary)
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 28)
                .fill(AppTheme.card)
                .shadow(color: AppTheme.shadow, radius: 8, x: 0, y: 2)
        )
        .padding(.bottom, 20)
    }

    func isValidEmail(_ email: String) -> Bool {
        let emailRegex = #"^[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return email.range(of: emailRegex, options: .regularExpression) != nil
    }
    func isValidPhone(_ phone: String) -> Bool {
        let phoneRegex = #"^\+?[0-9]{7,15}$"#
        return phone.range(of: phoneRegex, options: .regularExpression) != nil
    }
}

// MARK: - ProfileTagDropdownEditor (Dropdown + manual add & Firestore auto-update)
struct ProfileTagDropdownEditor: View {
    let title: String
    @Binding var items: [String]
    var suggestions: [String] = []
    var optionType: ProfileOptionType
    @State private var newItem: String = ""
    @State private var selectedSuggestion: String = ""
    var placeholder: String = "Add new..."

    var body: some View {
        VStack(alignment: .leading) {
            Text(title)
                .font(.headline)

            // Chips for selected items
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(items, id: \.self) { item in
                        HStack(spacing: 2) {
                            Text(item)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Capsule().fill(Color.blue.opacity(0.15)))
                            Button(action: {
                                if let idx = items.firstIndex(of: item) {
                                    items.remove(at: idx)
                                }
                            }) {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.red)
                            }
                        }
                    }
                }
            }

            // Dropdown picker for suggestions
            if !suggestions.isEmpty {
                Picker("Select \(title)", selection: $selectedSuggestion) {
                    Text("Select \(title)").tag("")
                    ForEach(suggestions.filter { !items.contains($0) }, id: \.self) { suggestion in
                        Text(suggestion).tag(suggestion)
                    }
                }
                .pickerStyle(MenuPickerStyle())
                .onChange(of: selectedSuggestion) { oldValue, newValue in
                    if !newValue.isEmpty && !items.contains(newValue) {
                        items.append(newValue)
                        selectedSuggestion = ""
                    }
                }
            }

            // Manual text field for custom entry (adds to Firestore)
            HStack {
                TextField(placeholder, text: $newItem)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                Button(action: {
                    let trimmed = newItem.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty && !items.contains(trimmed) {
                        items.append(trimmed)
                        addOptionToFirestore(type: optionType, value: trimmed)
                        newItem = ""
                    }
                }) {
                    Image(systemName: "plus.circle.fill")
                        .foregroundColor(.green)
                        .font(.title2)
                }
                .disabled(newItem.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(.vertical, 8)
    }
}
