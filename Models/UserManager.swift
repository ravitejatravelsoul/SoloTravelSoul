import Foundation
import FirebaseFirestore

public class UserManager {
    private let db = Firestore.firestore()
    private let usersCollection = "users"
    private let counterDocId = "user_id_counter"

    // Get next available user UID (e.g., "50000", "50001", ...)
    public func getNextUserId(completion: @escaping (String?) -> Void) {
        let counterDoc = db.collection(usersCollection).document(counterDocId)
        db.runTransaction({ (transaction, errorPointer) -> Any? in
            let counterSnapshot: DocumentSnapshot
            do {
                try counterSnapshot = transaction.getDocument(counterDoc)
            } catch let error as NSError {
                errorPointer?.pointee = error
                return nil
            }

            let current = (counterSnapshot.data()?["value"] as? Int) ?? 49999
            let next = current + 1
            transaction.setData(["value": next], forDocument: counterDoc)
            return next
        }) { (object, error) in
            if let error = error {
                print("❌ Failed to get next userId: \(error)")
                completion(nil)
            } else if let next = object as? Int {
                completion("\(next)")
            } else {
                completion(nil)
            }
        }
    }

    // Create user in Firestore with custom UID and name fields
    public func createUser(userProfile: UserProfile, completion: @escaping (UserProfile?) -> Void) {
        getNextUserId { [weak self] userId in
            guard let userId = userId, let self = self else {
                completion(nil)
                return
            }
            var profile = userProfile
            profile.id = userId
            self.db.collection(self.usersCollection).document(userId).setData(profile.toDict()) { error in
                if let error = error {
                    print("❌ Failed to create user: \(error)")
                    completion(nil)
                } else {
                    completion(profile)
                }
            }
        }
    }

    // Fetch all registered users
    public func fetchAllUsers(completion: @escaping ([UserProfile]) -> Void) {
        db.collection(usersCollection).whereField(FieldPath.documentID(), isNotEqualTo: counterDocId).getDocuments { snapshot, error in
            guard let docs = snapshot?.documents else {
                completion([])
                return
            }
            let users = docs.compactMap { UserProfile.fromDict($0.data()) }
            completion(users)
        }
    }
}
