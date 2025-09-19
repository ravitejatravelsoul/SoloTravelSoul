# SoloTravelSoul

SoloTravelSoul is a SwiftUI‑based iOS application that helps solo travelers plan and manage trips, discover new places, and connect with travel companions.

## Features

- **Authentication & User Profiles**: Sign up, log in, and manage your profile with preferences and social links.
- **Trip Planning**: Create trips with start and end dates, notes, and location data.  Plan itineraries and manage daily activities.
- **Discover & Recommendations**: Browse attractions from bundled JSON data and integrate with Google Places to discover nearby points of interest.  The Google Places API key is read from `Config.swift`/`Info.plist` instead of being hard‑coded in source.
- **Group Travel & Chat**: Form travel groups, chat with companions, and manage group itineraries.
- **Journaling & Memories**: Add journal entries and trip diaries to capture your travel experiences.
- **Notifications**: Receive updates about group requests and trip approvals.

## Getting Started

### Requirements

- Xcode 12 or later
- Swift 5.5 or later
- A valid Firebase/Firestore project and Google Places API key (see `Services/FirestoreService.swift` and `Services/GooglePlacesService.swift`).

### Setup

1. Clone the repository or download the ZIP.
2. Open `SoloTravelSoul.xcodeproj` in Xcode.
3. Replace the sample API keys and Firebase configuration in `GoogleService-Info.plist` with your own.  For the Google Places API key, add a `GooglePlacesAPIKey` entry to your app's `Info.plist` or configure it via `Config.swift`.
4. Build and run on an iOS simulator or device.

## Contributing

Pull requests are welcome! Before submitting, please ensure:

- Code is formatted and linted.
- There are no `.DS_Store` or other system files committed.
- You have added relevant tests and updated documentation.

## License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.