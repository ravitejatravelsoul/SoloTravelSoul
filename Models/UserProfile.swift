import Foundation

public struct UserProfile: Codable, Identifiable, Equatable {
    public var id: String
    public var name: String
    public var email: String
    public var phone: String
    public var birthday: String
    public var gender: String
    public var country: String
    public var city: String
    public var bio: String
    public var preferences: [String]
    public var favoriteDestinations: [String]
    public var languages: [String]
    public var emergencyContact: String
    public var socialLinks: String
    public var privacyEnabled: Bool
    public var firstName: String?
    public var lastName: String?
    public var photoURL: String?

    public var initials: String {
        if let first = firstName, let last = lastName, !first.isEmpty, !last.isEmpty {
            let firstInitial = first.first.map { String($0) } ?? ""
            let lastInitial = last.first.map { String($0) } ?? ""
            return (firstInitial + lastInitial).uppercased()
        } else {
            let names = name.split(separator: " ")
            let initials = names.prefix(2).compactMap { $0.first }
            return initials.map { String($0) }.joined().uppercased()
        }
    }

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
        preferences: [String],
        favoriteDestinations: [String],
        languages: [String],
        emergencyContact: String,
        socialLinks: String,
        privacyEnabled: Bool,
        firstName: String? = nil,
        lastName: String? = nil,
        photoURL: String? = nil
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
        self.photoURL = photoURL
    }

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
            "privacyEnabled": privacyEnabled,
            "firstName": firstName ?? "",
            "lastName": lastName ?? "",
            "photoURL": photoURL ?? ""
        ]
    }

    /// This version is tolerant to both [String] and String (comma-separated) for arrays (for migration/backward compatibility)
    public static func fromDict(_ dict: [String: Any]) -> UserProfile? {
        func toStringArray(_ value: Any?) -> [String] {
            if let arr = value as? [String] { return arr }
            if let str = value as? String {
                return str.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            }
            return []
        }
        guard
            let id = dict["id"] as? String,
            let name = dict["name"] as? String,
            let email = dict["email"] as? String,
            let phone = dict["phone"] as? String,
            let birthday = dict["birthday"] as? String,
            let gender = dict["gender"] as? String,
            let country = dict["country"] as? String,
            let city = dict["city"] as? String,
            let bio = dict["bio"] as? String,
            let emergencyContact = dict["emergencyContact"] as? String,
            let socialLinks = dict["socialLinks"] as? String,
            let privacyEnabled = dict["privacyEnabled"] as? Bool
        else { return nil }

        let preferences = toStringArray(dict["preferences"])
        let favoriteDestinations = toStringArray(dict["favoriteDestinations"])
        let languages = toStringArray(dict["languages"])

        let firstName = dict["firstName"] as? String
        let lastName = dict["lastName"] as? String
        let photoURL = dict["photoURL"] as? String

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
            lastName: lastName,
            photoURL: photoURL
        )
    }
}
