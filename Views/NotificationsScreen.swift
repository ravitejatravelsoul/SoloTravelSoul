import SwiftUI

struct NotificationsScreen: View {
    @EnvironmentObject var notificationsVM: NotificationsViewModel

    var body: some View {
        VStack {
            Text("Notifications: \(notificationsVM.notifications.count)")
                .padding()
            List(notificationsVM.notifications) { notif in
                VStack(alignment: .leading) {
                    Text(notif.title).bold()
                    Text(notif.message)
                    Text("\(notif.createdAt)").font(.caption)
                }
            }
        }
    }
}
