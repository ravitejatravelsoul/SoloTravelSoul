import Foundation
import FirebaseFirestore

public class CompanionSuggestionViewModel: ObservableObject {
    @Published public var suggestions: [UserProfile] = []
    private let db = Firestore.firestore()

    // Call with the current user profile and all users/trips
    public func findCompanions(for currentUser: UserProfile, allUsers: [UserProfile], allGroups: [GroupTrip]) {
        // Very basic: match anyone with at least one shared favorite destination or language
        let currentFavs = Set(currentUser.favoriteDestinations.lowercased().split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) })
        let currentLangs = Set(currentUser.languages.lowercased().split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) })
        self.suggestions = allUsers.filter { user in
            guard user.id != currentUser.id else { return false }
            let userFavs = Set(user.favoriteDestinations.lowercased().split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) })
            let userLangs = Set(user.languages.lowercased().split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) })
            return !currentFavs.isDisjoint(with: userFavs) || !currentLangs.isDisjoint(with: userLangs)
        }
    }
}
