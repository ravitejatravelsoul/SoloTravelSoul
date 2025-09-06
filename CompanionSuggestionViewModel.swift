import Foundation
import FirebaseFirestore

public class CompanionSuggestionViewModel: ObservableObject {
    @Published public var suggestions: [UserProfile] = []
    private let db = Firestore.firestore()

    // Call with the current user profile and all users/trips
    public func findCompanions(for currentUser: UserProfile, allUsers: [UserProfile], allGroups: [GroupTrip]) {
        // Lowercased and trimmed sets for matching
        let currentFavs = Set(currentUser.favoriteDestinations.map { $0.lowercased().trimmingCharacters(in: .whitespaces) })
        let currentLangs = Set(currentUser.languages.map { $0.lowercased().trimmingCharacters(in: .whitespaces) })
        self.suggestions = allUsers.filter { user in
            guard user.id != currentUser.id else { return false }
            let userFavs = Set(user.favoriteDestinations.map { $0.lowercased().trimmingCharacters(in: .whitespaces) })
            let userLangs = Set(user.languages.map { $0.lowercased().trimmingCharacters(in: .whitespaces) })
            return !currentFavs.isDisjoint(with: userFavs) || !currentLangs.isDisjoint(with: userLangs)
        }
    }
}
