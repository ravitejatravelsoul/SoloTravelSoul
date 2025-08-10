import Foundation
import FirebaseFirestore
import FirebaseAuth

final class FirestoreService {
    static let shared = FirestoreService()
    private let db = Firestore.firestore()

    // MARK: - Trips

    func fetchTrips(forUser uid: String, completion: @escaping (Result<[PlannedTrip], Error>) -> Void) {
        db.collection("users").document(uid).collection("trips")
            .order(by: "startDate")
            .getDocuments { snapshot, error in
                if let error = error {
                    completion(.failure(error))
                    return
                }
                let trips: [PlannedTrip] = snapshot?.documents.compactMap { doc in
                    let data = doc.data()
                    return PlannedTrip.fromDict(data)
                } ?? []
                completion(.success(trips))
            }
    }

    func addOrUpdateTrip(_ trip: PlannedTrip, forUser uid: String, completion: ((Error?) -> Void)? = nil) {
        let tripDict = trip.toDict()
        db.collection("users").document(uid).collection("trips")
            .document(trip.id.uuidString)
            .setData(tripDict, merge: true) { error in
                completion?(error)
            }
    }

    func deleteTrip(_ tripId: UUID, forUser uid: String, completion: ((Error?) -> Void)? = nil) {
        db.collection("users").document(uid).collection("trips")
            .document(tripId.uuidString)
            .delete(completion: completion)
    }
}
