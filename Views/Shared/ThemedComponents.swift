import SwiftUI

/// A collection of reusable, themed UI components.  These wrappers apply the
/// app's design language (colours, corner radii, shadows) consistently
/// across different screens.  Using these components helps reduce duplicate
/// styling code and makes it easy to iterate on the look and feel in one
/// place.

/// A card container that applies padding, background colour, corner radius
/// and shadow.  Use this to wrap content that should appear as a card.
struct ThemedCard<Content: View>: View {
    let content: Content
    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }
    var body: some View {
        content
            .padding()
            .background(AppTheme.card)
            .cornerRadius(AppTheme.cardCornerRadius)
            .shadow(color: AppTheme.shadow, radius: AppTheme.cardShadow, x: 0, y: 2)
            .padding(.horizontal)
    }
}

/// A button with the app's primary tint colour and prominent styling.  Automatically
/// applies disabled appearance if the button is not enabled.
struct ThemedButton<Label: View>: View {
    let action: () -> Void
    let label: Label
    let isDisabled: Bool
    init(isDisabled: Bool = false, action: @escaping () -> Void, @ViewBuilder label: () -> Label) {
        self.action = action
        self.label = label()
        self.isDisabled = isDisabled
    }
    var body: some View {
        Button(action: action) {
            label
        }
        .buttonStyle(.borderedProminent)
        .tint(AppTheme.primary)
        .disabled(isDisabled)
    }
}

/// A text field that uses rounded border style and the app's accent colour for the cursor.
struct ThemedTextField: View {
    @Binding var text: String
    var placeholder: String
    var keyboardType: UIKeyboardType = .default
    var body: some View {
        TextField(placeholder, text: $text)
            .keyboardType(keyboardType)
            .textFieldStyle(RoundedBorderTextFieldStyle())
            .accentColor(AppTheme.primary)
    }
}

/// A secure text field with the app's accent colour.
struct ThemedSecureField: View {
    @Binding var text: String
    var placeholder: String
    var body: some View {
        SecureField(placeholder, text: $text)
            .textFieldStyle(RoundedBorderTextFieldStyle())
            .accentColor(AppTheme.primary)
    }
}