import Foundation

/// A central place to store configuration values such as API keys and environment‑specific settings.
///
/// This struct reads values from your app's Info.plist at runtime.  To supply your own keys, add
/// the corresponding keys to `Info.plist` (for example, `GooglePlacesAPIKey`).  You should **never**
/// hard‑code secrets directly in source code.  See README for setup instructions.
public struct Config {
    /// The Google Places API key used by `GooglePlacesService`.  If no key is found in the
    /// app's Info.plist, an empty string is returned.  Be sure to add a `GooglePlacesAPIKey`
    /// entry to your Info.plist with your actual key for network requests to succeed.
    public static var googlePlacesAPIKey: String {
        if let key = Bundle.main.object(forInfoDictionaryKey: "GooglePlacesAPIKey") as? String {
            return key
        }
        return ""
    }

    /// Add additional configuration values here, such as Firebase project IDs, endpoint URLs,
    /// feature flags, or analytics tokens.  Access them via `Config.<propertyName>`.
}