import Foundation

public struct UserProfile: Codable, Hashable {
    public var id: String
    public var name: String
    public var email: String
    // Add all other fields you use in your app
    public var phone: String
    public var birthday: String
    public var gender: String
    public var country: String
    public var city: String
    public var bio: String
    public var preferences: String
    public var favoriteDestinations: String
    public var languages: String
    public var emergencyContact: String
    public var socialLinks: String
    public var privacyEnabled: Bool

    public func toDict() -> [String: Any] {
        return [
            "id": id,
            "name": name,
            "email": email,
            "phone": phone,
            "birthday": birthday,
            "gender": gender,
            "country": country,
            "city": city,
            "bio": bio,
            "preferences": preferences,
            "favoriteDestinations": favoriteDestinations,
            "languages": languages,
            "emergencyContact": emergencyContact,
            "socialLinks": socialLinks,
            "privacyEnabled": privacyEnabled
        ]
    }

    public static func fromDict(_ dict: [String: Any]) -> UserProfile? {
        guard let id = dict["id"] as? String,
              let name = dict["name"] as? String,
              let email = dict["email"] as? String,
              let phone = dict["phone"] as? String,
              let birthday = dict["birthday"] as? String,
              let gender = dict["gender"] as? String,
              let country = dict["country"] as? String,
              let city = dict["city"] as? String,
              let bio = dict["bio"] as? String,
              let preferences = dict["preferences"] as? String,
              let favoriteDestinations = dict["favoriteDestinations"] as? String,
              let languages = dict["languages"] as? String,
              let emergencyContact = dict["emergencyContact"] as? String,
              let socialLinks = dict["socialLinks"] as? String,
              let privacyEnabled = dict["privacyEnabled"] as? Bool
        else { return nil }

        return UserProfile(
            id: id,
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
    }
}
