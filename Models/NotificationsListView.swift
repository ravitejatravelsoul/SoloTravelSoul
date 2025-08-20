import SwiftUI

struct NotificationsListView: View {
    let notifications: [NotificationItem]

    var body: some View {
        NavigationView {
            List(notifications) { notification in
                VStack(alignment: .leading, spacing: 6) {
                    Text(notification.title)
                        .font(.headline)
                    Text(notification.message)
                    Text(notification.createdAt, style: .date)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 6)
                .background(notification.isRead ? Color.clear : Color.yellow.opacity(0.15))
                .cornerRadius(8)
            }
            .navigationTitle("Notifications")
        }
    }
}
