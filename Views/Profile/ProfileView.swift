//
//  ProfileView.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/16/25.
//


import SwiftUI

struct ProfileView: View {
    var body: some View {
        VStack {
            Image(systemName: "person.crop.circle")
                .resizable()
                .frame(width: 80, height: 80)
                .padding()
            Text("Your Profile")
                .font(.title)
            Text("Manage your account, preferences, and sign out.")
                .foregroundColor(.secondary)
        }
    }
}
