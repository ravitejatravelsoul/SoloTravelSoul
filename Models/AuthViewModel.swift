import Foundation
import FirebaseAuth
import FirebaseFirestore

class AuthViewModel: ObservableObject {
    @Published var user: User?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var db = Firestore.firestore()
    private var authHandle: AuthStateDidChangeListenerHandle?

    init() {
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            self?.user = user
            if let user = user {
                self?.fetchProfileFromFirestore(userID: user.uid)
            } else {
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
        socialLinks: String,
        favoriteDestinations: String,
        languages: String,
        emergencyContact: String,
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
                    let data: [String: Any] = [
                        "email": email,
                        "name": name,
                        "phone": phone,
                        "birthday": birthday,
                        "gender": gender,
                        "country": country,
                        "city": city,
                        "bio": bio,
                        "preferences": preferences,
                        "socialLinks": socialLinks,
                        "favoriteDestinations": favoriteDestinations,
                        "languages": languages,
                        "emergencyContact": emergencyContact,
                        "privacyEnabled": privacyEnabled,
                        "createdAt": FieldValue.serverTimestamp()
                    ]
                    self?.db.collection("users").document(user.uid).setData(data) { err in
                        if let err = err {
                            self?.errorMessage = "Profile save failed: \(err.localizedDescription)"
                            completion(false)
                        } else {
                            self?.fetchProfileFromFirestore(userID: user.uid) {
                                completion(true)
                            }
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
        db.collection("users").document(userID).getDocument { snapshot, error in
            if let data = snapshot?.data() {
                self.saveProfileToAppStorage(data)
            }
            completion()
        }
    }

    func saveProfileToAppStorage(_ data: [String: Any]) {
        UserDefaults.standard.setValue(data["name"] as? String ?? "", forKey: "name")
        UserDefaults.standard.setValue(data["email"] as? String ?? "", forKey: "email")
        UserDefaults.standard.setValue(data["phone"] as? String ?? "", forKey: "phone")
        UserDefaults.standard.setValue(data["birthday"] as? String ?? "", forKey: "birthday")
        UserDefaults.standard.setValue(data["gender"] as? String ?? "", forKey: "gender")
        UserDefaults.standard.setValue(data["country"] as? String ?? "", forKey: "country")
        UserDefaults.standard.setValue(data["city"] as? String ?? "", forKey: "city")
        UserDefaults.standard.setValue(data["bio"] as? String ?? "", forKey: "bio")
        UserDefaults.standard.setValue(data["preferences"] as? String ?? "", forKey: "preferences")
        UserDefaults.standard.setValue(data["socialLinks"] as? String ?? "", forKey: "socialLinks")
        UserDefaults.standard.setValue(data["favoriteDestinations"] as? String ?? "", forKey: "favoriteDestinations")
        UserDefaults.standard.setValue(data["languages"] as? String ?? "", forKey: "languages")
        UserDefaults.standard.setValue(data["emergencyContact"] as? String ?? "", forKey: "emergencyContact")
        UserDefaults.standard.setValue(data["privacyEnabled"] as? Bool ?? false, forKey: "privacyEnabled")
    }

    func clearProfileFromAppStorage() {
        let keys = [
            "name", "email", "phone", "birthday", "gender", "country", "city", "bio",
            "preferences", "socialLinks", "favoriteDestinations", "languages",
            "emergencyContact", "privacyEnabled"
        ]
        for key in keys {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }

    /// Update profile fields in Firestore and AppStorage
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
        socialLinks: String,
        favoriteDestinations: String,
        languages: String,
        emergencyContact: String,
        privacyEnabled: Bool,
        completion: @escaping (Bool) -> Void
    ) {
        let data: [String: Any] = [
            "name": name,
            "phone": phone,
            "birthday": birthday,
            "gender": gender,
            "country": country,
            "city": city,
            "bio": bio,
            "preferences": preferences,
            "socialLinks": socialLinks,
            "favoriteDestinations": favoriteDestinations,
            "languages": languages,
            "emergencyContact": emergencyContact,
            "privacyEnabled": privacyEnabled
        ]
        // Use setData(merge: true) to create or update the document safely
        db.collection("users").document(userID).setData(data, merge: true) { error in
            DispatchQueue.main.async {
                if let error = error {
                    print("Failed to update profile: \(error.localizedDescription)")
                    self.errorMessage = error.localizedDescription
                    completion(false)
                } else {
                    print("Profile updated successfully.")
                    self.saveProfileToAppStorage(data)
                    completion(true)
                }
            }
        }
    }
}
