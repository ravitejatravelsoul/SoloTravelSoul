import SwiftUI

struct SideDrawerView: View {
    let user: UserProfile
    let onClose: () -> Void
    let onSelectNotifications: () -> Void
    let onSelectApprovals: () -> Void
    let onSelectChats: () -> Void

    var initials: String {
        let components = user.name
            .split(separator: " ")
            .compactMap { $0.first }
        return String(components.prefix(2))
    }

    var body: some View {
        ZStack(alignment: .leading) {
            Color.black.opacity(0.28)
                .ignoresSafeArea()
                .onTapGesture(perform: onClose)

            VStack(alignment: .leading, spacing: 28) {
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
                                        .overlay(Circle().stroke(Color.blue.opacity(0.2), lineWidth: 2))
                                        .shadow(color: Color.black.opacity(0.08), radius: 6, x: 0, y: 2)
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
        .preferredColorScheme(.light)
    }

    var fallbackInitials: some View {
        Circle()
            .fill(Color.blue.opacity(0.18))
            .frame(width: 56, height: 56)
            .overlay(
                Text(initials)
                    .font(.title)
                    .bold()
                    .foregroundColor(.blue)
            )
            .overlay(Circle().stroke(Color.blue.opacity(0.2), lineWidth: 2))
            .shadow(color: Color.black.opacity(0.08), radius: 6, x: 0, y: 2)
    }
}
