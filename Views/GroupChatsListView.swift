//
//  GroupChatsListView.swift
//  SoloTravelSoul
//
//  Created by Raviteja on 8/15/25.
//


import SwiftUI

struct GroupChatsListView: View {
    let groups: [GroupTrip]
    var body: some View {
        List(groups) { group in
            Text("Chat: \(group.name)") // Customize as needed
        }
        .navigationTitle("Group Chats")
    }
}
