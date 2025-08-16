//
//  ContentViewWithMenu.swift
//  SoloTravelSoul
//
//  Created by Raviteja on 8/15/25.
//


import SwiftUI

struct ContentViewWithMenu: View {
    @State private var showMenu = false

    var body: some View {
        ZStack {
            NavigationView {
                MainContentView()
                    .navigationBarItems(leading: Button(action: {
                        withAnimation { showMenu.toggle() }
                    }) {
                        Image(systemName: "line.horizontal.3")
                            .imageScale(.large)
                    })
            }
            if showMenu {
                Color.black.opacity(0.3)
                    .ignoresSafeArea()
                    .onTapGesture { withAnimation { showMenu = false } }
                SideMenu(
                    onSelectNotifications: {
                        // Replace with navigation to Notifications
                        showMenu = false
                    },
                    onSelectChats: {
                        // Replace with navigation to Chats
                        showMenu = false
                    }
                )
                .frame(width: 260)
                .transition(.move(edge: .leading))
            }
        }
    }
}