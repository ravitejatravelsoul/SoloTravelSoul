import SwiftUI
import PhotosUI

struct ProfileView: View {
    @AppStorage("userName") private var userName = "Ravi Teja"
    @AppStorage("userBio") private var userBio = "Adventurer. Solo traveler. Coffee lover."
    @AppStorage("travelPreferences") private var travelPreferencesData: String = ""
    @AppStorage("profilePhotoData") private var profilePhotoData: Data?
    @AppStorage("isLoggedIn") private var isLoggedIn = false

    @State private var isEditing = false
    @State private var newPreference = ""
    @State private var localPreferences: [String] = []
    @State private var selectedPhoto: PhotosPickerItem?

    var profileImage: Image? {
        if let data = profilePhotoData, let uiImage = UIImage(data: data) {
            return Image(uiImage: uiImage)
        }
        return nil
    }

    func loadPreferences() -> [String] {
        (try? JSONDecoder().decode([String].self, from: Data(travelPreferencesData.utf8))) ?? ["Mountains", "Beaches", "Culture", "Road Trips"]
    }
    func savePreferences(_ prefs: [String]) {
        if let data = try? JSONEncoder().encode(prefs) {
            travelPreferencesData = String(data: data, encoding: .utf8) ?? ""
        }
    }

    var body: some View {
        VStack(spacing: 20) {
            // Profile Photo
            PhotosPicker(selection: $selectedPhoto, matching: .images, photoLibrary: .shared()) {
                if let image = profileImage {
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 120, height: 120)
                        .clipShape(Circle())
                        .overlay(Circle().stroke(Color.blue, lineWidth: 3))
                        .shadow(radius: 6)
                } else {
                    ZStack {
                        Circle()
                            .fill(Color.blue.opacity(0.3))
                            .frame(width: 120, height: 120)
                        Image(systemName: "person.circle.fill")
                            .resizable()
                            .scaledToFit()
                            .foregroundColor(.white)
                            .frame(width: 80, height: 80)
                    }
                }
            }
            .onChange(of: selectedPhoto) { _, newValue in
                if let newItem = newValue {
                    Task {
                        if let data = try? await newItem.loadTransferable(type: Data.self) {
                            profilePhotoData = data
                        }
                    }
                }
            }
            .padding(.top, 30)

            // Name and Bio
            if isEditing {
                TextField("Enter your name", text: $userName)
                    .font(.title2)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .padding(.horizontal)
                TextField("Edit your bio", text: $userBio)
                    .font(.body)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .padding(.horizontal)
            } else {
                Text(userName)
                    .font(.title)
                    .fontWeight(.bold)
                Text(userBio)
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            // Travel Preferences
            VStack(alignment: .leading, spacing: 8) {
                Text("Travel Preferences:")
                    .font(.headline)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(localPreferences, id: \.self) { pref in
                            HStack(spacing: 4) {
                                Text(pref)
                                    .padding(8)
                                    .background(Color.blue.opacity(0.1))
                                    .cornerRadius(8)
                                if isEditing {
                                    Button(action: {
                                        if let idx = localPreferences.firstIndex(of: pref) {
                                            localPreferences.remove(at: idx)
                                        }
                                    }) {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundColor(.red)
                                    }
                                }
                            }
                        }
                    }
                }
                if isEditing {
                    HStack {
                        TextField("Add preference", text: $newPreference)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                        Button("Add") {
                            let trimmed = newPreference.trimmingCharacters(in: .whitespaces)
                            if !trimmed.isEmpty && !localPreferences.contains(trimmed) {
                                localPreferences.append(trimmed)
                                newPreference = ""
                            }
                        }
                        .disabled(newPreference.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .padding(.horizontal)

        
            .padding(.top, 10)

            Spacer()
            Button("Log out") {
                isLoggedIn = false
            }
            .padding(.bottom, 24)
            .foregroundColor(.red)
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(isEditing ? "Done" : "Edit") {
                    if isEditing {
                        savePreferences(localPreferences)
                    } else {
                        localPreferences = loadPreferences()
                    }
                    isEditing.toggle()
                }
            }
        }
        .onAppear {
            localPreferences = loadPreferences()
        }
    }
}
