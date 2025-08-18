import SwiftUI

struct UserAvatarView: View {
    let user: UserProfile
    var size: CGFloat = 40

    var initials: String {
        let parts = user.name.split(separator: " ").compactMap { $0.first }
        return String(parts.prefix(2))
    }

    var body: some View {
        if let urlStr = user.photoURL, let url = URL(string: urlStr) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .empty:
                    ProgressView()
                        .frame(width: size, height: size)
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                        .frame(width: size, height: size)
                        .clipShape(Circle())
                case .failure(_):
                    fallbackInitials
                @unknown default:
                    fallbackInitials
                }
            }
        } else {
            fallbackInitials
        }
    }

    var fallbackInitials: some View {
        Circle()
            .fill(Color.blue.opacity(0.2))
            .frame(width: size, height: size)
            .overlay(
                Text(initials)
                    .font(.system(size: size / 2))
                    .bold()
                    .foregroundColor(.blue)
            )
    }
}
