//
//  NotificationsListView.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 8/8/25.
//


import SwiftUI

struct NotificationsListView: View {
    @ObservedObject var notificationsVM: NotificationsViewModel
    var body: some View {
        List(notificationsVM.notifications) { notification in
            VStack(alignment: .leading) {
                Text(notification.message)
                    .font(.body)
                Text(Date(timeIntervalSince1970: notification.timestamp), style: .time)
                    .font(.caption)
                    .foregroundColor(.gray)
            }
        }
        .navigationTitle("Notifications")
    }
}
