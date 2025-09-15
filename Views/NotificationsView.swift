import SwiftUI

struct NotificationsView: View {
    @ObservedObject var vm: NotificationsViewModel

    var body: some View {
        NavigationView {
            List {
                ForEach(vm.notifications) { notif in
                    Button(action: {
                        if !notif.isRead {
                            vm.markAsRead(notificationId: notif.id)
                        }
                        handleNotificationTap(notif)
                    }) {
                        HStack(alignment: .top, spacing: 12) {
                            // Unread indicator
                            if !notif.isRead {
                                Circle()
                                    .fill(Color.blue)
                                    .frame(width: 8, height: 8)
                                    .padding(.top, 7)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(notif.title)
                                    .fontWeight(notif.isRead ? .regular : .bold)
                                    .foregroundColor(.primary)
                                Text(notif.message)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                Text(notif.createdAt, style: .time)
                                    .font(.caption2)
                                    .foregroundColor(.gray)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 6)
                        .background(
                            notif.isRead ? Color.clear : Color.yellow.opacity(0.13)
                        )
                        .cornerRadius(8)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            .listStyle(.plain)
            .navigationTitle("Notifications")
        }
        .onAppear {
            // Call setup with the current user's uid and (optionally) appState
            // vm.setup(userId: currentUser.id, appState: appState)
        }
    }

    private func handleNotificationTap(_ notif: NotificationItem) {
        // Replace with your actual navigation logic
        switch notif.type {
        case "group_chat":
            print("Navigate to group chat for groupId: \(notif.groupId ?? "")")
        case "join_request", "join_approved", "join_denied":
            print("Navigate to group details for groupId: \(notif.groupId ?? "")")
        default:
            print("Handle notification type: \(notif.type)")
        }
    }
}
