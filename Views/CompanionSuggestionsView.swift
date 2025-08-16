//
//  CompanionSuggestionsView.swift
//  SoloTravelSoul
//
//  Created by Raviteja on 8/15/25.
//


import SwiftUI

struct CompanionSuggestionsView: View {
    @ObservedObject var vm: CompanionSuggestionViewModel
    let currentUser: UserProfile

    var body: some View {
        List(vm.suggestions) { user in
            VStack(alignment: .leading) {
                Text(user.name).bold()
                Text("Languages: \(user.languages)")
                Text("Favorite Destinations: \(user.favoriteDestinations)")
            }
        }
        .onAppear {
            // You'd fetch all users and groups from your DB, then:
            // vm.findCompanions(for: currentUser, allUsers: ..., allGroups: ...)
        }
    }
}