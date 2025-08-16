import SwiftUI

struct NotificationsListView: View {
    let notifications: [NotificationItem]
    var body: some View {
        List(notifications) { notification in
            VStack(alignment: .leading) {
                Text(notification.title).bold()
                Text(notification.message)
                Text(notification.createdAt, style: .date)
                    .font(.caption)
            }
            .background(notification.isRead ? Color.clear : Color.yellow.opacity(0.2))
        }
        .navigationTitle("Group Requests")
    }
}
