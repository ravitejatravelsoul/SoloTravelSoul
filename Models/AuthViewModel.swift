import Foundation
import FirebaseAuth
import FirebaseFirestore
import FirebaseStorage
import SwiftUI

public class AuthViewModel: ObservableObject {
    @Published var user: User?
    @Published var profile: UserProfile?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var db = Firestore.firestore()
    private var storage = Storage.storage()
    private var authHandle: AuthStateDidChangeListenerHandle?
    private var profileListener: ListenerRegistration?

    var currentUserProfile: UserProfile? {
        return profile
    }

    public init() {
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            self?.user = user
            _ = self // <-- silences warning
            if let user = user {
                self?.listenForProfileChanges(userID: user.uid)
            } else {
                self?.profile = nil
                _ = self // <-- silences warning
                self?.profileListener?.remove()
                self?.profileListener = nil
            }
        }
    }

    deinit {
        if let handle = authHandle {
            Auth.auth().removeStateDidChangeListener(handle)
        }
        profileListener?.remove()
    }

    // MARK: - Firebase Storage - Upload Profile Image

    /// Uploads the image data to Firebase Storage and returns the download URL string.
    func uploadProfileImage(userID: String, imageData: Data, completion: @escaping (String?) -> Void) {
        let ref = storage.reference().child("profile_images/\(userID).jpg")
        let metadata = StorageMetadata()
        metadata.contentType = "image/jpeg"
        ref.putData(imageData, metadata: metadata) { [weak self] metadata, error in
            _ = self
            if let error = error {
                print("❌ Failed to upload profile image: \(error.localizedDescription)")
                completion(nil)
                return
            }
            ref.downloadURL { url, error in
                if let error = error {
                    print("❌ Failed to get download URL: \(error.localizedDescription)")
                    completion(nil)
                    return
                }
                completion(url?.absoluteString)
            }
        }
    }

    // MARK: - Auth Methods

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
        profileImageData: Data? = nil,
        completion: @escaping (Bool) -> Void
    ) {
        isLoading = true
        errorMessage = nil
        Auth.auth().createUser(withEmail: email, password: password) { [weak self] result, error in
            DispatchQueue.main.async {
                self?.isLoading = false
                _ = self // <-- silences warning
                if let error = error {
                    self?.errorMessage = error.localizedDescription
                    _ = self // <-- silences warning
                    completion(false)
                } else if let user = result?.user {
                    let saveProfile: (String?) -> Void = { photoURL in
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
                            privacyEnabled: privacyEnabled,
                            photoURL: photoURL
                        )
                        self?.db.collection("users").document(user.uid).setData(profile.toDict()) { err in
                            if let err = err {
                                self?.errorMessage = "Profile save failed: \(err.localizedDescription)"
                                _ = self // <-- silences warning
                                completion(false)
                            } else {
                                self?.profile = profile
                                _ = self // <-- silences warning
                                completion(true)
                            }
                        }
                    }

                    if let imageData = profileImageData {
                        self?.uploadProfileImage(userID: user.uid, imageData: imageData) { url in
                            saveProfile(url)
                        }
                    } else {
                        saveProfile(nil)
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
                _ = self // <-- silences warning
                if let error = error {
                    self?.errorMessage = error.localizedDescription
                    _ = self // <-- silences warning
                    completion(false)
                } else if let user = result?.user {
                    self?.listenForProfileChanges(userID: user.uid)
                    completion(true)
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
            _ = self // <-- silences warning
            self.profile = nil
            _ = self // <-- silences warning
            self.profileListener?.remove()
            self.profileListener = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func sendPasswordReset(email: String, completion: @escaping (Bool) -> Void) {
        Auth.auth().sendPasswordReset(withEmail: email) { error in
            DispatchQueue.main.async {
                completion(error == nil)
            }
        }
    }

    // MARK: - Firestore User Profile Methods

    func fetchProfileFromFirestore(userID: String, completion: @escaping () -> Void = {}) {
        db.collection("users").document(userID).getDocument { [weak self] snapshot, error in
            if let error = error {
                self?.errorMessage = error.localizedDescription
                _ = self // <-- silences warning
            }
            if let data = snapshot?.data(), let profile = UserProfile.fromDict(data) {
                self?.profile = profile
                _ = self // <-- silences warning
            } else if let user = self?.user {
                // If no profile exists, create a default profile and save to Firestore
                let defaultProfile = UserProfile(
                    id: user.uid,
                    name: user.email ?? "Unknown",
                    email: user.email ?? "Unknown",
                    phone: "", birthday: "", gender: "", country: "", city: "",
                    bio: "", preferences: "", favoriteDestinations: "", languages: "",
                    emergencyContact: "", socialLinks: "", privacyEnabled: false,
                    photoURL: nil
                )
                self?.profile = defaultProfile
                _ = self // <-- silences warning
                self?.db.collection("users").document(user.uid).setData(defaultProfile.toDict(), merge: true)
            }
            completion()
        }
    }

    /// Listen for real-time changes to the user's profile document and update the local profile.
    func listenForProfileChanges(userID: String) {
        profileListener?.remove()
        profileListener = db.collection("users").document(userID).addSnapshotListener { [weak self] snapshot, error in
            if let error = error {
                self?.errorMessage = error.localizedDescription
                _ = self // <-- silences warning
                return
            }
            if let data = snapshot?.data(), let profile = UserProfile.fromDict(data) {
                DispatchQueue.main.async {
                    self?.profile = profile
                    _ = self // <-- silences warning
                }
            }
        }
    }

    /// Update profile details. Optionally include new profile image data to upload.
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
        profileImageData: Data? = nil,
        completion: @escaping (Bool) -> Void
    ) {
        guard let existingProfile = self.profile else {
            completion(false)
            return
        }

        let finishUpdate: (String?) -> Void = { photoURL in
            let newProfile = UserProfile(
                id: existingProfile.id,
                name: name,
                email: existingProfile.email,
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
                privacyEnabled: privacyEnabled,
                firstName: existingProfile.firstName,
                lastName: existingProfile.lastName,
                photoURL: photoURL ?? existingProfile.photoURL
            )
            self.db.collection("users").document(userID).setData(newProfile.toDict(), merge: true) { [weak self] error in
                DispatchQueue.main.async {
                    if let error = error {
                        self?.errorMessage = error.localizedDescription
                        _ = self // <-- silences warning
                        completion(false)
                    } else {
                        self?.profile = newProfile
                        _ = self // <-- silences warning
                        completion(true)
                    }
                }
            }
        }

        if let imageData = profileImageData {
            uploadProfileImage(userID: userID, imageData: imageData) { url in
                finishUpdate(url)
            }
        } else {
            finishUpdate(nil)
        }
    }
}
