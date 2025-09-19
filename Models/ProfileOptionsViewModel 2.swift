import Foundation
import FirebaseFirestore

class ProfileOptionsViewModel: ObservableObject {
    @Published var preferences: [String] = []
    @Published var destinations: [String] = []
    @Published var languages: [String] = []

    private let db = Firestore.firestore()

    func fetchPreferences() {
        db.collection("preferences").getDocuments { snapshot, error in
            guard let docs = snapshot?.documents, error == nil else { return }
            let names = docs.compactMap { $0["name"] as? String }
            DispatchQueue.main.async {
                self.preferences = names.sorted()
            }
        }
    }

    func fetchDestinations() {
        db.collection("destinations").getDocuments { snapshot, error in
            guard let docs = snapshot?.documents, error == nil else { return }
            let names = docs.compactMap { $0["name"] as? String }
            DispatchQueue.main.async {
                self.destinations = names.sorted()
            }
        }
    }

    func fetchLanguages() {
        db.collection("languages").getDocuments { snapshot, error in
            guard let docs = snapshot?.documents, error == nil else { return }
            let names = docs.compactMap { $0["name"] as? String }
            DispatchQueue.main.async {
                self.languages = names.sorted()
            }
        }
    }

    func addPreference(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        db.collection("preferences").addDocument(data: ["name": trimmed])
        if !preferences.contains(trimmed) {
            preferences.append(trimmed)
            preferences.sort()
        }
    }

    func addDestination(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        db.collection("destinations").addDocument(data: ["name": trimmed])
        if !destinations.contains(trimmed) {
            destinations.append(trimmed)
            destinations.sort()
        }
    }

    func addLanguage(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        db.collection("languages").addDocument(data: ["name": trimmed])
        if !languages.contains(trimmed) {
            languages.append(trimmed)
            languages.sort()
        }
    }
}
