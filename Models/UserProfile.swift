import Foundation

public struct UserProfile: Codable, Hashable, Identifiable, Equatable {
    public var id: String                          // Firebase UID string
    public var name: String
    public var email: String
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
    public var firstName: String?
    public var lastName: String?

    public init(
        id: String,
        name: String,
        email: String,
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
        firstName: String? = nil,
        lastName: String? = nil
    ) {
        self.id = id
        self.name = name
        self.email = email
        self.phone = phone
        self.birthday = birthday
        self.gender = gender
        self.country = country
        self.city = city
        self.bio = bio
        self.preferences = preferences
        self.favoriteDestinations = favoriteDestinations
        self.languages = languages
        self.emergencyContact = emergencyContact
        self.socialLinks = socialLinks
        self.privacyEnabled = privacyEnabled
        self.firstName = firstName
        self.lastName = lastName
    }

    public func toDict() -> [String: Any] {
        var dict: [String: Any] = [
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
        if let firstName = firstName { dict["firstName"] = firstName }
        if let lastName = lastName { dict["lastName"] = lastName }
        return dict
    }

    /// RELAXED VERSION: Accepts missing fields and sets empty strings or sensible defaults
    public static func fromDict(_ dict: [String: Any]) -> UserProfile? {
        guard let id = dict["id"] as? String else { return nil }
        let name = dict["name"] as? String ?? ""
        let email = dict["email"] as? String ?? ""
        let phone = dict["phone"] as? String ?? ""
        let birthday = dict["birthday"] as? String ?? ""
        let gender = dict["gender"] as? String ?? ""
        let country = dict["country"] as? String ?? ""
        let city = dict["city"] as? String ?? ""
        let bio = dict["bio"] as? String ?? ""
        let preferences = dict["preferences"] as? String ?? ""
        let favoriteDestinations = dict["favoriteDestinations"] as? String ?? ""
        let languages = dict["languages"] as? String ?? ""
        let emergencyContact = dict["emergencyContact"] as? String ?? ""
        let socialLinks = dict["socialLinks"] as? String ?? ""
        let privacyEnabled = dict["privacyEnabled"] as? Bool ?? false
        let firstName = dict["firstName"] as? String
        let lastName = dict["lastName"] as? String

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
            privacyEnabled: privacyEnabled,
            firstName: firstName,
            lastName: lastName
        )
    }
}
