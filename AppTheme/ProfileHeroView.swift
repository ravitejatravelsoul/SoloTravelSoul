import SwiftUI

struct ProfileHeroView: View {
    let user: UserProfile

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Background placeholder
            LinearGradient(
                gradient: Gradient(colors: [Color.gray.opacity(0.15), Color.gray.opacity(0.45)]),
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: 180)
            // Avatar & Name
            VStack(alignment: .leading, spacing: 8) {
                UserAvatarView(user: user, size: 72)
                    .overlay(
                        Circle()
                            .stroke(AppTheme.primary, lineWidth: 2)
                    )
                Text(user.name)
                    .font(.title.bold())
                    .foregroundColor(.white)
                if !user.bio.isEmpty {
                    Text(user.bio)
                        .font(.body)
                        .foregroundColor(.white.opacity(0.85))
                        .lineLimit(2)
                }
            }
            .padding()
        }
        .frame(height: 180)
        .background(AppTheme.card)
        .cornerRadius(AppTheme.cardCornerRadius)
        .shadow(color: AppTheme.shadow, radius: 4, x: 0, y: 2)
        .padding(.horizontal)
    }
}
