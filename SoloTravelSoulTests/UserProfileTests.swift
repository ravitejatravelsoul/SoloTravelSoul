import XCTest
@testable import SoloTravelSoul

/// Unit tests for the `UserProfile` model.
///
/// These tests verify that the model's computed properties and helper methods behave
/// as expected.  They also exercise the `fromDict` initializer to ensure that
/// dictionary‑based initialisation correctly handles both array and comma‑separated
/// string formats.
final class UserProfileTests: XCTestCase {
    /// Test that the `initials` computed property returns the first letters of the
    /// first and last names (or full name when first/last are nil).
    func testInitialsComputation() {
        let profile = UserProfile(
            id: "123",
            name: "John Doe",
            email: "john@example.com",
            phone: "1234567890",
            birthday: "1990-01-01",
            gender: "Male",
            country: "USA",
            city: "Chicago",
            bio: "Hello",
            preferences: ["Hiking"],
            favoriteDestinations: ["Paris"],
            languages: ["English"],
            emergencyContact: "9876543210",
            socialLinks: "",
            privacyEnabled: false,
            firstName: "John",
            lastName: "Doe",
            photoURL: nil
        )
        XCTAssertEqual(profile.initials, "JD")
    }

    /// Test that converting a profile to a dictionary and back retains the same values.
    func testToDictAndFromDict() {
        let profile = UserProfile(
            id: "ABC",
            name: "Jane Smith",
            email: "jane@example.com",
            phone: "5551234567",
            birthday: "1985-05-05",
            gender: "Female",
            country: "Canada",
            city: "Toronto",
            bio: "Traveler",
            preferences: ["Museums", "Food"],
            favoriteDestinations: ["Tokyo", "Rome"],
            languages: ["English", "French"],
            emergencyContact: "5559876543",
            socialLinks: "https://instagram.com/jane",
            privacyEnabled: true
        )
        let dict = profile.toDict()
        guard let decoded = UserProfile.fromDict(dict) else {
            XCTFail("Failed to decode UserProfile from dictionary")
            return
        }
        XCTAssertEqual(decoded.id, profile.id)
        XCTAssertEqual(decoded.name, profile.name)
        XCTAssertEqual(decoded.email, profile.email)
        XCTAssertEqual(decoded.phone, profile.phone)
        XCTAssertEqual(decoded.preferences, profile.preferences)
        XCTAssertEqual(decoded.favoriteDestinations, profile.favoriteDestinations)
        XCTAssertEqual(decoded.languages, profile.languages)
        XCTAssertEqual(decoded.emergencyContact, profile.emergencyContact)
        XCTAssertEqual(decoded.socialLinks, profile.socialLinks)
        XCTAssertEqual(decoded.privacyEnabled, profile.privacyEnabled)
    }

    /// Test that `fromDict` correctly parses comma‑separated strings into arrays.
    func testFromDictWithCommaSeparatedStrings() {
        let dict: [String: Any] = [
            "id": "XYZ",
            "name": "Alex Johnson",
            "email": "alex@example.com",
            "phone": "1231231234",
            "birthday": "1992-02-02",
            "gender": "Non-binary",
            "country": "UK",
            "city": "London",
            "bio": "Explorer",
            "preferences": "Art, Music",
            "favoriteDestinations": "New York, Sydney",
            "languages": "English, Spanish",
            "emergencyContact": "3213214321",
            "socialLinks": "",
            "privacyEnabled": false
        ]
        let profile = UserProfile.fromDict(dict)
        XCTAssertNotNil(profile)
        XCTAssertEqual(profile?.preferences, ["Art", "Music"])
        XCTAssertEqual(profile?.favoriteDestinations, ["New York", "Sydney"])
        XCTAssertEqual(profile?.languages, ["English", "Spanish"])
    }
}