import SwiftUI

struct GroupJoinRequestsView: View {
    let requests: [UserProfile]
    var onAccept: (UserProfile) -> Void
    var onReject: (UserProfile) -> Void

    var body: some View {
        List(requests) { user in
            HStack {
                UserAvatarView(user: user, size: 36)
                VStack(alignment: .leading) {
                    Text(user.name)
                    Text(user.email).font(.caption).foregroundColor(.secondary)
                }
                Spacer()
                Button(action: { onAccept(user) }) {
                    Image(systemName: "checkmark.circle").foregroundColor(.green)
                }
                Button(action: { onReject(user) }) {
                    Image(systemName: "xmark.circle").foregroundColor(.red)
                }
            }
        }
        .navigationTitle("Join Requests")
    }
}
