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
                        .fill(Color.blue.opacity(0.18))
                    Text(initials)
                        .font(.title)
                        .bold()
                        .foregroundColor(.blue)
                }
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.blue.opacity(0.2), lineWidth: 2))
        .shadow(color: Color.black.opacity(0.08), radius: 6, x: 0, y: 2)
    }

    var body: some View {
        ZStack(alignment: .leading) {
            // Background dim
            Color.black.opacity(0.28)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)

            VStack(alignment: .leading, spacing: 28) {
                // Profile Section with avatar (pic or initials)
                HStack(spacing: 16) {
                    avatar
                    VStack(alignment: .leading, spacing: 2) {
                        Text(user.name)
                            .font(.headline)
                            .foregroundColor(.primary)
                        Text("@\(user.id)")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                }
                .padding(.top, 44)

                Divider()

                // Notifications section
                Group {
                    Text("Notifications")
                        .font(.title3)
                        .bold()
                        .foregroundColor(.black)
                    Button(action: onSelectNotifications) {
                        Label("Group Requests", systemImage: "person.2.fill")
                            .labelStyle(IconLabelStyle())
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(PlainButtonStyle())
                    .padding(.leading, 8)

                    Button(action: onSelectApprovals) {
                        Label("Approvals", systemImage: "checkmark.seal.fill")
                            .labelStyle(IconLabelStyle())
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(PlainButtonStyle())
                    .padding(.leading, 8)
                }

                Divider()

                // Chats section
                Text("Chats")
                    .font(.title3)
                    .bold()
                    .foregroundColor(.black)
                Button(action: onSelectChats) {
                    Label("All Group Chats", systemImage: "message.fill")
                        .labelStyle(IconLabelStyle())
                        .padding(.vertical, 4)
                }
                .buttonStyle(PlainButtonStyle())
                .padding(.leading, 8)

                Divider()

                // Profile section
                Text("Profile")
                    .font(.title3)
                    .bold()
                    .foregroundColor(.black)
                Button(action: onSelectProfile) {
                    Label("Profile", systemImage: "person.crop.circle")
                        .labelStyle(IconLabelStyle())
                        .padding(.vertical, 4)
                }
                .buttonStyle(PlainButtonStyle())
                .padding(.leading, 8)

                Button(action: onLogout) {
                    Label("Logout", systemImage: "arrow.backward.circle.fill")
                        .foregroundColor(.red)
                        .labelStyle(IconLabelStyle())
                        .padding(.vertical, 4)
                }
                .buttonStyle(PlainButtonStyle())
                .padding(.leading, 8)
                .padding(.top, 8)

                Spacer()
            }
            .padding(.horizontal, 26)
            .padding(.bottom, 32)
            .frame(width: 300, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 0)
                    .fill(Color.white)
                    .shadow(color: Color.black.opacity(0.09), radius: 18, x: 2, y: 2)
            )
            .edgesIgnoringSafeArea(.all)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .preferredColorScheme(.light) // Always light mode for drawer
    }
}
