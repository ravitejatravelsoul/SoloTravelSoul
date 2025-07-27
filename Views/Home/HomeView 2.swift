//
//  HomeView 2.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/24/25.
//


import SwiftUI

struct HomeView: View {
    let plannedTrips = Trip.samplePlannedTrips()
    let historyTrips = Trip.sampleHistoryTrips()
    let inspirations = ["travel2", "travel3", "Bali"] // Asset names or place names
    let latestJournal = "Had a great time at the Golden Gate Bridge!"

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                if let nextTrip = plannedTrips.first {
                    NextTripOverviewCard(trip: nextTrip)
                }
                QuickActionsView(actions: [
                    QuickAction(title: "Add Trip", icon: "plus.circle.fill", action: {}),
                    QuickAction(title: "Discover", icon: "globe.europe.africa.fill", action: {}),
                    QuickAction(title: "Itinerary", icon: "list.bullet", action: {}),
                    QuickAction(title: "Journal", icon: "book.closed.fill", action: {})
                ])
                RecentTripsView(trips: plannedTrips + historyTrips)
                TravelJournalPreview(latestEntry: latestJournal)
                DiscoverInspirationView(inspirations: inspirations)
            }
            .padding(.top)
        }
        .navigationTitle("Solo Travel Soul")
    }
}

struct HomeView_Previews: PreviewProvider {
    static var previews: some View {
        HomeView()
    }
}