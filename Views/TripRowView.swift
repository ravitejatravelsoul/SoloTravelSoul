//
//  TripRowView.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/26/25.
//


import SwiftUI

struct TripRowView: View {
    let trip: PlannedTrip
    let onEdit: (() -> Void)?

    var body: some View {
        AccessibleCardView(
            accessibilityLabel: "Trip to \(trip.destination), from \(trip.startDate.formatted(date: .abbreviated, time: .omitted))",
            accessibilityHint: "Tap to view or edit trip",
            action: onEdit
        ) {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    Text(trip.destination)
                        .font(.headline)
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    Text("\(trip.startDate.formatted(date: .abbreviated, time: .omitted)) - \(trip.endDate.formatted(date: .abbreviated, time: .omitted))")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: "airplane")
                    .font(.title2)
                    .foregroundColor(.accentColor)
            }
        }
    }
}