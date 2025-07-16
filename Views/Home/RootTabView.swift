//
//  RootTabView.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/15/25.
//


import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            NavigationView {
                ProfileView()
            }
            .tabItem {
                Label("Profile", systemImage: "person.circle")
            }
            
            NavigationView {
                UpcomingTripsView()
            }
            .tabItem {
                Label("History", systemImage: "airplane.departure")
            }
            
            NavigationView {
                UpcomingTripsView()
            }
            .tabItem {
                Label("Upcoming", systemImage: "calendar.badge.plus")
            }
        }
    }
}
