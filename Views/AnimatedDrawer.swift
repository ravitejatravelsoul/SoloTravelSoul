import SwiftUI

struct AnimatedDrawer: View {
    let user: UserProfile
    let profileImageData: Data? // Pass from ProfileView/AppStorage or your state
    let onClose: () -> Void
    let onSelectNotifications: () -> Void
    let onSelectApprovals: () -> Void
    let onSelectChats: () -> Void
    let onSelectProfile: () -> Void
    let onLogout: () -> Void

    // Helper: Get initials from name
    var initials: String {
        let components = user.name
            .split(separator: " ")
            .compactMap { $0.first }
        return String(components.prefix(2))
    }

    var avatar: some View {
        Group {
            if let data = profileImageData, let uiImage = UIImage(data: data), !data.isEmpty {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                ZStack {
                    Circle()
                        .fill(Color.blue.opacity(0.2))
                    Text(initials)
                        .font(.title)
                        .bold()
                        .foregroundColor(.blue)
                }
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(Circle())
        .shadow(radius: 6)
    }

    var body: some View {
        ZStack(alignment: .leading) {
            Color.black.opacity(0.35)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)

            VStack(alignment: .leading, spacing: 24) {
                // Profile Section with avatar (pic or initials)
                HStack(spacing: 16) {
                    avatar
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

                Divider()

                // Profile section
                Text("Profile")
                    .font(.title3)
                    .bold()
                Button(action: onSelectProfile) {
                    Label("Profile", systemImage: "person.crop.circle")
                }
                .padding(.leading, 8)

                Button(action: onLogout) {
                    Label("Logout", systemImage: "arrow.backward.circle.fill")
                        .foregroundColor(.red)
                }
                .padding(.leading, 8)
                .padding(.top, 8)

                Spacer()
            }
            .padding(.horizontal, 24)
            .frame(width: 300, alignment: .leading)
            .background(.ultraThinMaterial)
            .edgesIgnoringSafeArea(.all)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
