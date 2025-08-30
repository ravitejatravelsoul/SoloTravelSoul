import SwiftUI

struct AppTheme {
    static let primary = Color.blue
    static let accent = Color.yellow
    static let card = Color.white
    static let background = Color(.systemGray6)
    static let textPrimary = Color.primary
    static let textSecondary = Color.secondary
    static let chipBackground = Color(.systemGray5)
    static let chipSelected = Color.blue
    static let searchBackground = Color.white.opacity(0.95)
    static let shadow = Color.black.opacity(0.07)
    static let tabBar = Color.white

    static let headingFont = Font.system(size: 28, weight: .bold)
    static let bodyFont = Font.system(size: 16, weight: .regular)

    static let cardCornerRadius: CGFloat = 18
    static let cardShadow: CGFloat = 10
}
