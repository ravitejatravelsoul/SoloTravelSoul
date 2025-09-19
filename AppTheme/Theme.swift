import SwiftUI

/// Global theme definitions for SoloTravelSoul.
///
/// Centralising colours and layout constants in one place makes it easier to
/// maintain a consistent look and feel throughout the app.  If you wish to
/// customise the appearance (e.g. dark mode colours, accent colours), modify
/// these values.  You can access them via `Theme.primaryColor`, etc.
public enum Theme {
    /// The primary brand colour used for buttons and highlights.
    public static let primaryColor: Color = Color(red: 0.07, green: 0.44, blue: 0.76)

    /// A secondary colour used for less prominent accents.
    public static let secondaryColor: Color = Color(red: 0.20, green: 0.60, blue: 0.86)

    /// Background colour for cards and list rows.
    public static let cardBackground: Color = Color(.secondarySystemBackground)

    /// Overall page background colour.
    public static let pageBackground: Color = Color(.systemBackground)

    /// Text colour for labels and content.
    public static let textColor: Color = Color.primary

    /// Corner radius used for cards and buttons.
    public static let cornerRadius: CGFloat = 12.0
}