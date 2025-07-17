import SwiftUI
import PhotosUI

struct EditProfileView: View {
    // Use AppStorage for persistence. No bindings needed!
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

    @Environment(\.dismiss) private var dismiss
    @State private var showValidationError = false
    @State private var validationError: String = ""

    // Profile Image Picker
    @State private var showImagePicker = false
    @State private var selectedPhoto: PhotosPickerItem? = nil

    // Birthday Picker
    @State private var showBirthdaySheet = false
    @State private var birthdayDate: Date = Date()

    // Gender Picker
    @State private var showGenderSheet = false
    @State private var genderSearchText = ""
    let genderOptions = ["Male", "Female", "Non-binary", "Prefer not to say", "Other"]

    // Country & City Sheet
    @State private var showCountrySheet = false
    @State private var showCitySheet = false
    @State private var countrySearchText = ""
    @State private var citySearchText = ""

    // Multi-select Sheets
    @State private var showDestSheet = false
    @State private var showLangSheet = false
    @State private var showPrefSheet = false

    // Selections
    @State private var selectedDestinations: Set<String> = []
    @State private var selectedLanguages: Set<String> = []
    @State private var selectedPreferences: Set<String> = []

    // Static Data
    let languageOptions = ["English", "Spanish", "French", "German", "Hindi", "Mandarin", "Arabic"]
    let destinationOptions = ["Paris", "Tokyo", "Sydney", "New York", "Cape Town", "Rio", "Bali"]
    let preferenceOptions = ["Hiking", "Beach", "Local Food", "Nightlife", "Museums", "Wildlife", "Shopping"]
    let countryOptions = ["India", "USA", "France", "Japan", "Australia", "Brazil", "South Africa"]
    let cityDatabase: [String: [String]] = [
        "India": ["Mumbai", "Delhi", "Bangalore", "Hyderabad"],
        "USA": ["New York", "Los Angeles", "Chicago", "Houston"],
        "France": ["Paris", "Lyon", "Marseille"],
        "Japan": ["Tokyo", "Kyoto", "Osaka"],
        "Australia": ["Sydney", "Melbourne", "Brisbane"],
        "Brazil": ["Rio", "Sao Paulo", "Brasilia"],
        "South Africa": ["Cape Town", "Johannesburg", "Durban"]
    ]
    var filteredCountries: [String] {
        if countrySearchText.isEmpty { return countryOptions }
        return countryOptions.filter { $0.localizedCaseInsensitiveContains(countrySearchText) }
    }
    var filteredCities: [String] {
        let suggestions = cityDatabase[country] ?? []
        if citySearchText.isEmpty { return suggestions }
        return suggestions.filter { $0.localizedCaseInsensitiveContains(citySearchText) }
    }
    var filteredGenders: [String] {
        if genderSearchText.isEmpty { return genderOptions }
        return genderOptions.filter { $0.localizedCaseInsensitiveContains(genderSearchText) }
    }

    let calendarFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    var body: some View {
        NavigationView {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color(.systemBackground), Color.blue.opacity(0.1)]),
                    startPoint: .top,
                    endPoint: .bottom
                ).ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 30) {
                        profileCard

                        Group {
                            SectionHeader(title: "Name", systemImage: "person")
                            EditField(text: $name, placeholder: "Your Name")

                            SectionHeader(title: "Email", systemImage: "envelope")
                            EditField(text: $email, placeholder: "Your Email", keyboardType: .emailAddress)

                            SectionHeader(title: "Phone", systemImage: "phone")
                            EditField(text: $phone, placeholder: "Phone Number", keyboardType: .phonePad)

                            SectionHeader(title: "Birthday", systemImage: "calendar")
                            Button {
                                showBirthdaySheet = true
                            } label: {
                                FieldDisplay(text: birthday.isEmpty ? "Select Birthday" : birthday)
                            }

                            SectionHeader(title: "Gender", systemImage: "figure.dress.line.vertical.figure")
                            Button {
                                showGenderSheet = true
                            } label: {
                                FieldDisplay(text: gender.isEmpty ? "Select Gender" : gender)
                            }
                        }

                        SectionHeader(title: "Country", systemImage: "globe")
                        Button {
                            showCountrySheet = true
                        } label: {
                            FieldDisplay(text: country.isEmpty ? "Select Country" : country)
                        }
                        SectionHeader(title: "City", systemImage: "mappin.and.ellipse")
                        Button {
                            showCitySheet = true
                        } label: {
                            FieldDisplay(text: city.isEmpty ? "Select City" : city)
                        }

                        SectionHeader(title: "Bio", systemImage: "quote.bubble")
                        VStack {
                            TextEditor(text: $bio)
                                .frame(height: 80)
                                .padding(8)
                                .background(Color(.secondarySystemBackground))
                                .cornerRadius(12)
                        }

                        SectionHeader(title: "Preferences", systemImage: "star.circle")
                        Button {
                            showPrefSheet = true
                        } label: {
                            FieldDisplay(text: selectedPreferences.isEmpty ? "Select Preferences" : selectedPreferences.sorted().joined(separator: ", "))
                        }

                        SectionHeader(title: "Favorite Destinations", systemImage: "airplane")
                        Button {
                            showDestSheet = true
                        } label: {
                            FieldDisplay(text: selectedDestinations.isEmpty ? "Select Destinations" : selectedDestinations.sorted().joined(separator: ", "))
                        }

                        SectionHeader(title: "Language Preferences", systemImage: "character.book.closed")
                        Button {
                            showLangSheet = true
                        } label: {
                            FieldDisplay(text: selectedLanguages.isEmpty ? "Select Languages" : selectedLanguages.sorted().joined(separator: ", "))
                        }

                        SectionHeader(title: "Social Media Links", systemImage: "link")
                        EditField(text: $socialLinks, placeholder: "Links (comma separated)")

                        SectionHeader(title: "Emergency Contact", systemImage: "phone.bubble.left")
                        EditField(text: $emergencyContact, placeholder: "Emergency Contact")

                        SectionHeader(title: "Privacy", systemImage: "lock.circle")
                        Toggle("Enable Privacy Mode", isOn: $privacyEnabled)
                            .toggleStyle(SwitchToggleStyle(tint: Color.blue))
                            .padding(.horizontal, 16)

                        Button(action: {
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
                            preferences = selectedPreferences.sorted().joined(separator: ", ")
                            favoriteDestinations = selectedDestinations.sorted().joined(separator: ", ")
                            languages = selectedLanguages.sorted().joined(separator: ", ")
                            dismiss()
                        }) {
                            Text("Save")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(LinearGradient(
                                    gradient: Gradient(colors: [Color.blue, Color.purple]),
                                    startPoint: .leading,
                                    endPoint: .trailing)
                                )
                                .foregroundColor(.white)
                                .cornerRadius(14)
                                .shadow(radius: 3)
                        }
                        .padding(.top, 10)
                    }
                    .padding(.vertical, 10)
                }
                .alert(validationError, isPresented: $showValidationError) {
                    Button("OK", role: .cancel) {}
                }
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)

            .sheet(isPresented: $showBirthdaySheet) {
                VStack(spacing: 24) {
                    Text("Select Your Birthday")
                        .font(.title2).bold()
                        .padding(.top, 24)
                    DatePicker(
                        "",
                        selection: $birthdayDate,
                        in: ...Date(),
                        displayedComponents: .date
                    )
                    .datePickerStyle(.graphical)
                    .labelsHidden()
                    .padding()
                    Button("Done") {
                        birthday = calendarFormatter.string(from: birthdayDate)
                        showBirthdaySheet = false
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    Spacer()
                }
                .padding()
            }
            .sheet(isPresented: $showGenderSheet) {
                SheetPicker(
                    title: "Select Gender",
                    options: filteredGenders,
                    searchText: $genderSearchText,
                    selected: $gender,
                    onDone: { showGenderSheet = false }
                )
            }
            .sheet(isPresented: $showCountrySheet) {
                SheetPicker(
                    title: "Select Country",
                    options: filteredCountries,
                    searchText: $countrySearchText,
                    selected: $country,
                    onDone: { showCountrySheet = false }
                )
            }
            .sheet(isPresented: $showCitySheet) {
                SheetPicker(
                    title: "Select City",
                    options: filteredCities,
                    searchText: $citySearchText,
                    selected: $city,
                    onDone: { showCitySheet = false }
                )
            }
            .sheet(isPresented: $showPrefSheet) {
                MultiSheetPicker(
                    title: "Preferences",
                    options: preferenceOptions,
                    selected: $selectedPreferences,
                    onDone: { showPrefSheet = false }
                )
            }
            .sheet(isPresented: $showDestSheet) {
                MultiSheetPicker(
                    title: "Favorite Destinations",
                    options: destinationOptions,
                    selected: $selectedDestinations,
                    onDone: { showDestSheet = false }
                )
            }
            .sheet(isPresented: $showLangSheet) {
                MultiSheetPicker(
                    title: "Language Preferences",
                    options: languageOptions,
                    selected: $selectedLanguages,
                    onDone: { showLangSheet = false }
                )
            }
            .photosPicker(isPresented: $showImagePicker, selection: $selectedPhoto, matching: .images)
        }
        .onAppear {
            selectedLanguages = Set(languages.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) })
            selectedDestinations = Set(favoriteDestinations.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) })
            selectedPreferences = Set(preferences.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) })
            if let date = calendarFormatter.date(from: birthday) {
                birthdayDate = date
            }
        }
        .onChange(of: selectedPhoto) {
            if let newPhoto = selectedPhoto {
                Task {
                    if let data = try? await newPhoto.loadTransferable(type: Data.self) {
                        profileImageData = data
                    }
                }
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
                    } else {
                        Image(systemName: "person.crop.circle.fill")
                            .resizable()
                            .foregroundColor(.blue)
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
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .clipShape(Circle())
                            .shadow(radius: 3)
                    }
                    .padding(4),
                    alignment: .bottomTrailing
                )
            }

            Text(name.isEmpty ? "Your Name" : name)
                .font(.title2)
                .bold()
            Text(email.isEmpty ? "your@email.com" : email)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 28)
                .fill(Color(.secondarySystemBackground))
                .shadow(color: Color(.systemGray).opacity(0.2), radius: 8, x: 0, y: 2)
        )
        .padding(.bottom, 20)
    }

    // MARK: - Validation
    func isValidEmail(_ email: String) -> Bool {
        let emailRegex = #"^[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return email.range(of: emailRegex, options: .regularExpression) != nil
    }
    func isValidPhone(_ phone: String) -> Bool {
        let phoneRegex = #"^\+?[0-9]{7,15}$"#
        return phone.range(of: phoneRegex, options: .regularExpression) != nil
    }
}

// MARK: - Components

struct EditField: View {
    @Binding var text: String
    var placeholder: String
    var keyboardType: UIKeyboardType = .default
    var body: some View {
        TextField(placeholder, text: $text)
            .padding(12)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(12)
            .keyboardType(keyboardType)
            .padding(.horizontal, 8)
    }
}

struct SheetPicker: View {
    let title: String
    let options: [String]
    @Binding var searchText: String
    @Binding var selected: String
    var onDone: () -> Void

    var filtered: [String] {
        if searchText.isEmpty { return options }
        return options.filter { $0.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                TextField("Search \(title.lowercased())...", text: $searchText)
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(10)
                    .padding(.top, 16)
                    .padding(.horizontal, 16)
                List {
                    ForEach(filtered, id: \.self) { option in
                        Button {
                            selected = option
                            onDone()
                        } label: {
                            HStack {
                                Text(option)
                                if selected == option {
                                    Spacer()
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.blue)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.insetGrouped)
                Button("Done") { onDone() }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct MultiSheetPicker: View {
    let title: String
    let options: [String]
    @Binding var selected: Set<String>
    var onDone: () -> Void
    @State private var searchText: String = ""

    var filtered: [String] {
        if searchText.isEmpty { return options }
        return options.filter { $0.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                TextField("Search \(title.lowercased())...", text: $searchText)
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(10)
                    .padding(.top, 16)
                    .padding(.horizontal, 16)
                List {
                    ForEach(filtered, id: \.self) { option in
                        Button {
                            if selected.contains(option) {
                                selected.remove(option)
                            } else {
                                selected.insert(option)
                            }
                        } label: {
                            HStack {
                                Text(option)
                                Spacer()
                                if selected.contains(option) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(.blue)
                                } else {
                                    Image(systemName: "circle")
                                        .foregroundColor(.gray)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.insetGrouped)
                Button("Done") { onDone() }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
