import SwiftUI

struct GroupChatView: View {
    @ObservedObject var chatVM: GroupChatViewModel
    let currentUser: UserProfile
    let groupId: String
    @State private var draft = ""

    var body: some View {
        VStack {
            ScrollViewReader { scrollProxy in
                ScrollView {
                    LazyVStack {
                        ForEach(chatVM.messages) { message in
                            GroupChatMessageRow(message: message, currentUser: currentUser)
                                .id(message.id)
                        }
                    }
                }
                .onChange(of: chatVM.messages.count) { _, _ in
                    if let lastId = chatVM.messages.last?.id {
                        withAnimation {
                            scrollProxy.scrollTo(lastId, anchor: .bottom)
                        }
                    }
                }
            }
            HStack {
                TextField("Message", text: $draft)
                Button("Send") {
                    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else { return }
                    chatVM.sendMessage(sender: currentUser, text: text, groupId: groupId)
                    draft = ""
                }
            }
            .padding()
        }
        .navigationTitle("Group Chat")
        .onAppear {
            chatVM.setup(groupId: groupId)
        }
    }
}

struct GroupChatMessageRow: View {
    let message: GroupMessage
    let currentUser: UserProfile

    var body: some View {
        HStack(alignment: .bottom) {
            if message.senderId == currentUser.id {
                Spacer()
                Text(message.text)
                    .padding(8)
                    .background(Color.blue.opacity(0.2))
                    .cornerRadius(8)
            } else {
                // Adjust UserAvatarView call to match your actual initializer signature!
                UserAvatarView(
                    user: UserProfile(
                        id: message.senderId,
                        name: message.senderName,
                        email: "",
                        phone: "",
                        birthday: "",
                        gender: "",
                        country: "",
                        city: "",
                        bio: "",
                        preferences: "",
                        favoriteDestinations: "",
                        languages: "",
                        emergencyContact: "",
                        socialLinks: "",
                        privacyEnabled: false,
                        photoURL: nil
                    ),
                    size: 28
                )
                VStack(alignment: .leading) {
                    Text(message.senderName)
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(message.text)
                        .padding(8)
                        .background(Color.gray.opacity(0.2))
                        .cornerRadius(8)
                }
                Spacer()
            }
        }
        .padding(.vertical, 2)
    }
}
