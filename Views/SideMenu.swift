//
//  SideMenu.swift
//  SoloTravelSoul
//
//  Created by Raviteja on 8/15/25.
//


import SwiftUI

struct SideMenu: View {
    let onSelectNotifications: () -> Void
    let onSelectChats: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 40) {
            Text("Menu")
                .font(.largeTitle)
                .bold()
                .padding(.top, 40)
            
            Group {
                Text("Notifications")
                    .font(.headline)
                Button("Group Requests", action: onSelectNotifications)
                    .padding(.leading, 16)
                Button("Approvals", action: onSelectNotifications)
                    .padding(.leading, 16)
            }
            
            Divider()
            
            Group {
                Text("Chats")
                    .font(.headline)
                Button("All Group Chats", action: onSelectChats)
                    .padding(.leading, 16)
            }
            
            Spacer()
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: 260, alignment: .leading)
        .background(Color(.systemGray6))
        .edgesIgnoringSafeArea(.all)
    }
}