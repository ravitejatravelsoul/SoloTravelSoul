//
//  NotificationsView.swift
//  SoloTravelSoul
//
//  Created by Raviteja on 8/15/25.
//


import SwiftUI

struct NotificationsView: View {
    @ObservedObject var vm: NotificationsViewModel

    var body: some View {
        List(vm.notifications) { notif in
            VStack(alignment: .leading) {
                Text(notif.title).bold()
                Text(notif.message)
                Text("\(notif.createdAt)").font(.caption)
            }
            .background(notif.isRead ? Color.clear : Color.yellow.opacity(0.2))
        }
        .onAppear {
            // vm.setup(userId: currentUser.id)
        }
    }
}

