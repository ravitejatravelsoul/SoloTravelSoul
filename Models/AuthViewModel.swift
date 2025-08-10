import Foundation
import FirebaseAuth
import FirebaseFirestore

public class AuthViewModel: ObservableObject {
    @Published var user: User?
    @Published var profile: UserProfile?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var db = Firestore.firestore()
    private var authHandle: AuthStateDidChangeListenerHandle?

    var currentUserProfile: UserProfile? {
        if let profile = profile { return profile }
        guard let user = user else { return nil }
        let name = UserDefaults.standard.string(forKey: "name") ?? ""
        let email = UserDefaults.standard.string(forKey: "email") ?? ""
        return UserProfile(
            id: user.uid,
            name: name.isEmpty ? (email.isEmpty ? "Unknown" : email) : name,
            email: email,
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
            privacyEnabled: false
        )
    }

    public init() {
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            self?.user = user
            if let user = user {
                self?.fetchProfileFromFirestore(userID: user.uid)
            } else {
                self?.profile = nil
                self?.clearProfileFromAppStorage()
            }
        }
    }

    deinit {
        if let handle = authHandle {
            Auth.auth().removeStateDidChangeListener(handle)
        }
    }

    func signUp(
        email: String,
        password: String,
        name: String,
        phone: String,
        birthday: String,
        gender: String,
        country: String,
        city: String,
        bio: String,
        preferences: String,
        favoriteDestinations: String,
        languages: String,
        emergencyContact: String,
        socialLinks: String,
        privacyEnabled: Bool,
        completion: @escaping (Bool) -> Void
    ) {
        isLoading = true
        errorMessage = nil
        Auth.auth().createUser(withEmail: email, password: password) { [weak self] result, error in
            DispatchQueue.main.async {
                self?.isLoading = false
                if let error = error {
                    print("Firebase signUp error: \(error.localizedDescription)")
                    self?.errorMessage = error.localizedDescription
                    completion(false)
                } else if let user = result?.user {
                    let profile = UserProfile(
                        id: user.uid,
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
                        privacyEnabled: privacyEnabled
                    )
                    print("[signUp] Saving profile to Firestore: \(profile.toDict())")
                    self?.db.collection("users").document(user.uid).setData(profile.toDict()) { err in
                        if let err = err {
                            print("Profile save failed: \(err.localizedDescription)")
                            self?.errorMessage = "Profile save failed: \(err.localizedDescription)"
                            completion(false)
                        } else {
                            print("Profile saved successfully.")
                            self?.setProfile(profile)
                            completion(true)
                        }
                    }
                }
            }
        }
    }

    func signIn(email: String, password: String, completion: @escaping (Bool) -> Void) {
        isLoading = true
        errorMessage = nil
        Auth.auth().signIn(withEmail: email, password: password) { [weak self] result, error in
            DispatchQueue.main.async {
                self?.isLoading = false
                if let error = error {
                    print("Firebase signIn error: \(error.localizedDescription)")
                    self?.errorMessage = error.localizedDescription
                    completion(false)
                } else if let user = result?.user {
                    self?.fetchProfileFromFirestore(userID: user.uid) {
                        completion(true)
                    }
                } else {
                    completion(false)
                }
            }
        }
    }

    func signOut() {
        do {
            try Auth.auth().signOut()
            self.user = nil
            self.profile = nil
            clearProfileFromAppStorage()
            print("User signed out successfully.")
        } catch {
            print("Error signing out: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
        }
    }

    func sendPasswordReset(email: String, completion: @escaping (Bool) -> Void) {
        Auth.auth().sendPasswordReset(withEmail: email) { error in
            DispatchQueue.main.async {
                if let error = error {
                    print("Password reset error: \(error.localizedDescription)")
                }
                completion(error == nil)
            }
        }
    }

    func fetchProfileFromFirestore(userID: String, completion: @escaping () -> Void = {}) {
        db.collection("users").document(userID).getDocument { [weak self] snapshot, error in
            if let error = error {
                print("[fetchProfileFromFirestore] Failed: \(error.localizedDescription)")
            }
            if let data = snapshot?.data(), let profile = UserProfile.fromDict(data) {
                print("[fetchProfileFromFirestore] Got profile: \(profile.toDict())")
                self?.setProfile(profile)
            }
            completion()
        }
    }

    func updateProfile(
        userID: String,
        name: String,
        phone: String,
        birthday: String,
        gender: String,
        country: String,
        city: String,
        bio: String,
        preferences: String,
        favoriteDestinations: String,
        languages: String,
        emergencyContact: String,
        socialLinks: String,
        privacyEnabled: Bool,
        completion: @escaping (Bool) -> Void
    ) {
        guard let profile = self.profile else {
            print("updateProfile: No profile in memory.")
            completion(false)
            return
        }
        let newProfile = UserProfile(
            id: profile.id,
            name: name,
            email: profile.email,
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
            privacyEnabled: privacyEnabled
        )
        print("[updateProfile] Attempting to update Firestore for userID: \(userID)")
        print("[updateProfile] Data: \(newProfile.toDict())")
        db.collection("users").document(userID).setData(newProfile.toDict(), merge: true) { [weak self] error in
            DispatchQueue.main.async {
                if let error = error {
                    print("❌ Failed to update profile: \(error.localizedDescription)")
                    print("Profile dict: \(newProfile.toDict())")
                    print("UserID: \(userID)")
                    self?.errorMessage = error.localizedDescription
                    completion(false)
                } else {
                    print("✅ Profile updated successfully.")
                    self?.setProfile(newProfile)
                    completion(true)
                }
            }
        }
    }

    // MARK: - AppStorage helpers

    private func setProfile(_ profile: UserProfile) {
        self.profile = profile
        saveProfileToAppStorage(profile)
    }

    private func saveProfileToAppStorage(_ profile: UserProfile) {
        let data = profile.toDict()
        for (key, value) in data {
            UserDefaults.standard.setValue(value, forKey: key)
        }
    }

    private func clearProfileFromAppStorage() {
        let keys = [
            "id", "name", "email", "phone", "birthday", "gender", "country", "city", "bio",
            "preferences", "favoriteDestinations", "languages",
            "emergencyContact", "socialLinks", "privacyEnabled"
        ]
        for key in keys {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }
}
