//
//  NextTripOverviewCard 2.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 8/9/25.
//


import SwiftUI

// MARK: - Stubs for HomeView Dependencies

struct NextTripOverviewCard: View {
    let trip: PlannedTrip
    let onEdit: () -> Void
    var body: some View {
        VStack { Text("Next Trip: \(trip.destination)") }
    }
}

struct QuickAction {
    let title: String
    let icon: String
    let action: () -> Void
}

struct QuickActionsView: View {
    let actions: [QuickAction]
    var body: some View {
        HStack {
            ForEach(actions.indices, id: \.self) { i in
                Button(action: actions[i].action) {
                    VStack {
                        Image(systemName: actions[i].icon)
                        Text(actions[i].title)
                    }
                }
            }
        }
    }
}

struct RecentTripsView: View {
    let trips: [PlannedTrip]
    let onEditTrip: (PlannedTrip) -> Void
    var body: some View {
        VStack {
            Text("Recent Trips")
            ForEach(trips, id: \.id) { trip in
                HStack {
                    Text(trip.destination)
                    Button("Edit") { onEditTrip(trip) }
                }
            }
        }
    }
}

struct TravelJournalPreview: View {
    let latestEntry: String
    var body: some View {
        VStack {
            Text("Latest Journal")
            Text(latestEntry)
        }
    }
}

struct DiscoverInspirationView: View {
    let inspirations: [String]
    var body: some View {
        VStack {
            Text("Discover Inspirations")
            ForEach(inspirations, id: \.self) { insp in
                Text(insp)
            }
        }
    }
}

struct AddTripView: View {
    var onAdd: (PlannedTrip) -> Void
    @Environment(\.dismiss) var dismiss
    @State private var destination = ""
    var body: some View {
        VStack {
            TextField("Destination", text: $destination)
            Button("Add Trip") {
                onAdd(PlannedTrip(id: UUID(), destination: destination, startDate: Date(), endDate: Date()))
                dismiss()
            }
        }
        .padding()
    }
}

struct DiscoverView: View {
    @ObservedObject var tripViewModel: TripViewModel
    var body: some View {
        Text("Discover View")
    }
}

struct ItineraryView: View {
    let trips: [PlannedTrip]
    var body: some View {
        Text("Itinerary View")
    }
}

struct JournalView: View {
    let latestEntry: String
    var body: some View {
        Text("Journal View: \(latestEntry)")
    }
}