import SwiftUI
import Combine
import FirebaseFirestore

class ProfileOptionsViewModel: ObservableObject {
    @Published var preferences: [String] = []
    @Published var destinations: [String] = []
    @Published var languages: [String] = []

    private var db = Firestore.firestore()
    private var listeners: [ListenerRegistration] = []

    // Firestore collection names (customize as needed)
    private let preferencesCollection = "profile_options_preferences"
    private let destinationsCollection = "profile_options_destinations"
    private let languagesCollection = "profile_options_languages"

    deinit {
        removeListeners()
    }

    init() {
        fetchPreferences()
        fetchDestinations()
        fetchLanguages()
    }

    // MARK: - Firestore Real-Time Listeners

    func fetchPreferences() {
        removeListener(for: preferencesCollection)
        let listener = db.collection(preferencesCollection).addSnapshotListener { [weak self] snapshot, error in
            guard let self = self else { return }
            if let docs = snapshot?.documents {
                self.preferences = docs.compactMap { $0.data()["value"] as? String }.sorted()
            }
        }
        listeners.append(listener)
    }

    func fetchDestinations() {
        removeListener(for: destinationsCollection)
        let listener = db.collection(destinationsCollection).addSnapshotListener { [weak self] snapshot, error in
            guard let self = self else { return }
            if let docs = snapshot?.documents {
                self.destinations = docs.compactMap { $0.data()["value"] as? String }.sorted()
            }
        }
        listeners.append(listener)
    }

    func fetchLanguages() {
        removeListener(for: languagesCollection)
        let listener = db.collection(languagesCollection).addSnapshotListener { [weak self] snapshot, error in
            guard let self = self else { return }
            if let docs = snapshot?.documents {
                self.languages = docs.compactMap { $0.data()["value"] as? String }.sorted()
            }
        }
        listeners.append(listener)
    }

    // MARK: - Firestore Add (adds to options for all users)
    func addPreference(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !preferences.contains(trimmed) else { return }
        db.collection(preferencesCollection).addDocument(data: ["value": trimmed])
    }

    func addDestination(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !destinations.contains(trimmed) else { return }
        db.collection(destinationsCollection).addDocument(data: ["value": trimmed])
    }

    func addLanguage(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !languages.contains(trimmed) else { return }
        db.collection(languagesCollection).addDocument(data: ["value": trimmed])
    }

    // MARK: - Listener Management
    private func removeListener(for collection: String) {
        // Remove previous listener for this collection (if any)
        listeners = listeners.filter { listener in
            // Firestore doesn't let you identify listeners by collection, so just keep all for now.
            // In a more advanced setup, you'd map listeners per collection.
            // For now, we just rely on deinit to remove all.
            true
        }
    }

    private func removeListeners() {
        for listener in listeners {
            listener.remove()
        }
        listeners.removeAll()
    }
}
