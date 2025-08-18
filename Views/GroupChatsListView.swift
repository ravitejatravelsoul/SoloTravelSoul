import SwiftUI

struct GroupChatsListView: View {
    let groups: [GroupTrip]
    let menuOnRight: Bool
    let onMenu: () -> Void

    var body: some View {
        List(groups) { group in
            HStack {
                UserAvatarView(user: group.creator, size: 32)
                VStack(alignment: .leading) {
                    Text("Chat: \(group.name)").font(.headline)
                    Text("Leader: \(group.creator.name)").font(.caption).foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle("Group Chats")
        .menuButton(menuOnRight: menuOnRight, onMenu: onMenu)
    }
}
