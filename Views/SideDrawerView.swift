import SwiftUI

struct SideDrawerView: View {
    let user: UserProfile
    let onClose: () -> Void
    let onSelectNotifications: () -> Void
    let onSelectApprovals: () -> Void
    let onSelectChats: () -> Void

    // Helper: Get initials from name
    var initials: String {
        let components = user.name
            .split(separator: " ")
            .compactMap { $0.first }
        return String(components.prefix(2))
    }

    var body: some View {
        ZStack(alignment: .leading) {
            Color.black.opacity(0.35)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)

            VStack(alignment: .leading, spacing: 24) {
                // Profile Section with remote photoURL or initials avatar
                HStack(spacing: 16) {
                    ZStack {
                        if let urlStr = user.photoURL, let url = URL(string: urlStr) {
                            AsyncImage(url: url) { phase in
                                switch phase {
                                case .empty:
                                    ProgressView()
                                        .frame(width: 56, height: 56)
                                case .success(let image):
                                    image
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 56, height: 56)
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
                    VStack(alignment: .leading) {
                        Text(user.name)
                            .font(.headline)
                        Text("@\(user.id)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.top, 40)

                Divider()

                // Notifications section
                Group {
                    Text("Notifications")
                        .font(.title3)
                        .bold()
                    Button(action: onSelectNotifications) {
                        Label("Group Requests", systemImage: "person.2.fill")
                    }
                    .padding(.leading, 8)

                    Button(action: onSelectApprovals) {
                        Label("Approvals", systemImage: "checkmark.seal.fill")
                    }
                    .padding(.leading, 8)
                }

                Divider()

                // Chats section
                Text("Chats")
                    .font(.title3)
                    .bold()
                Button(action: onSelectChats) {
                    Label("All Group Chats", systemImage: "message.fill")
                }
                .padding(.leading, 8)

                Spacer()
            }
            .padding(.horizontal, 24)
            .frame(width: 300, alignment: .leading)
            .background(.ultraThinMaterial)
            .edgesIgnoringSafeArea(.all)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // Fallback initials view
    var fallbackInitials: some View {
        Circle()
            .fill(Color.blue.opacity(0.2))
            .frame(width: 56, height: 56)
            .overlay(
                Text(initials)
                    .font(.title)
                    .bold()
                    .foregroundColor(.blue)
            )
    }
}
