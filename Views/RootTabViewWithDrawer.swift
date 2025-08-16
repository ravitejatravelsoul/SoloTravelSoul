//
//  RootTabViewWithDrawer.swift
//  SoloTravelSoul
//
//  Created by Raviteja on 8/15/25.
//


import SwiftUI

struct RootTabViewWithDrawer: View {
    @State private var showDrawer = false
    @State private var selectedDrawerSection: String? = nil
    @StateObject var userVM = UserViewModel() // Make sure you have a UserViewModel that provides UserProfile

    var body: some View {
        ZStack {
            TabView {
                HomeView()
                    .tabItem {
                        Label("Home", systemImage: "house")
                    }
                TripsView()
                    .tabItem {
                        Label("Trips", systemImage: "airplane")
                    }
                GroupsView()
                    .tabItem {
                        Label("Groups", systemImage: "person.3")
                    }
                ProfileView()
                    .tabItem {
                        Label("Profile", systemImage: "person.crop.circle")
                    }
            }
            .overlay(alignment: .topLeading) {
                Button(action: { withAnimation { showDrawer.toggle() } }) {
                    Image(systemName: "line.horizontal.3")
                        .imageScale(.large)
                        .padding()
                        .background(Color(.systemBackground).opacity(0.8))
                        .clipShape(Circle())
                }
                .padding(.top, 10)
                .padding(.leading, 10)
            }
            if showDrawer {
                SideDrawerView(
                    user: userVM.userProfile,
                    onClose: { withAnimation { showDrawer = false } },
                    onSelectNotifications: {
                        selectedDrawerSection = "notifications"
                        showDrawer = false
                    },
                    onSelectChats: {
                        selectedDrawerSection = "chats"
                        showDrawer = false
                    }
                )
                .transition(.move(edge: .leading))
                .zIndex(2)
            }
        }
        // Modal presentation of drawer destinations
        .fullScreenCover(item: $selectedDrawerSection) { section in
            if section == "notifications" {
                NotificationsListView(notifications: userVM.notifications)
            } else if section == "chats" {
                GroupChatsListView(groups: userVM.groupChats)
            }
        }
    }
}