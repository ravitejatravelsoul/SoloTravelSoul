//
//  GroupChatView.swift
//  SoloTravelSoul
//
//  Created by Raviteja on 8/15/25.
//


import SwiftUI

struct GroupChatView: View {
    @ObservedObject var chatVM: GroupChatViewModel
    let currentUser: UserProfile
    @State private var draft = ""

    var body: some View {
        VStack {
            ScrollView {
                ForEach(chatVM.messages) { message in
                    HStack(alignment: .bottom) {
                        if message.senderId == currentUser.id {
                            Spacer()
                            Text(message.text)
                                .padding(8)
                                .background(Color.blue.opacity(0.2))
                                .cornerRadius(8)
                        } else {
                            VStack(alignment: .leading) {
                                Text(message.senderName).font(.caption).foregroundColor(.gray)
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
            HStack {
                TextField("Message", text: $draft)
                Button("Send") {
                    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else { return }
                    chatVM.sendMessage(sender: currentUser, text: text)
                    draft = ""
                }
            }
            .padding()
        }
        .onAppear {
            // Call this with the selected group id
            chatVM.setup(groupId: /* group id here, e.g. group.id */ "")
        }
    }
}