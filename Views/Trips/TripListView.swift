//
//  TripListView.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/25/25.
//


import SwiftUI

struct TripListView: View {
    @ObservedObject var tripViewModel: TripViewModel
    @State private var selectedTrip: PlannedTrip? = nil

    var body: some View {
        NavigationStack {
            List(tripViewModel.trips) { trip in
                Button(action: {
                    selectedTrip = trip
                }) {
                    VStack(alignment: .leading) {
                        Text(trip.destination).bold()
                        Text("\(trip.startDate, style: .date) - \(trip.endDate, style: .date)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("Your Trips")
            .sheet(item: $selectedTrip) { trip in
                TripDetailView(tripViewModel: tripViewModel, trip: trip)
            }
        }
    }
}
