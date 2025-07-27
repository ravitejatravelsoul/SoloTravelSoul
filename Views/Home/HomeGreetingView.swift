//
//  HomeGreetingView.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/24/25.
//


import SwiftUI

struct HomeGreetingView: View {
    var userName: String
    var avatarImage: Image = Image("defaultAvatar") // Replace with user's image asset

    var body: some View {
        HStack(spacing: 16) {
            avatarImage
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 60, height: 60)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.accentColor, lineWidth: 2))
                .shadow(radius: 4)

            VStack(alignment: .leading, spacing: 4) {
                Text("Welcome back, \(userName)!")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)

                Text("Ready for your next adventure?")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                HStack(spacing: 12) {
                    Button(action: {
                        // Edit profile action
                    }) {
                        Label("Edit Profile", systemImage: "pencil")
                    }
                    .font(.caption)
                    .buttonStyle(.bordered)

                    Button(action: {
                        // Settings action
                    }) {
                        Label("Settings", systemImage: "gear")
                    }
                    .font(.caption)
                    .buttonStyle(.bordered)
                }
            }
            Spacer()
        }
        .padding(.horizontal)
        .padding(.top)
    }
}

struct HomeGreetingView_Previews: PreviewProvider {
    static var previews: some View {
        HomeGreetingView(
            userName: "Raviteja",
            avatarImage: Image(systemName: "person.crop.circle")
        )
        .previewLayout(.sizeThatFits)
    }
}