//
//  TravelJournalPreview.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/24/25.
//


import SwiftUI

struct TravelJournalPreview: View {
    let latestEntry: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Travel Journal")
                .font(.headline)
            if let entry = latestEntry, !entry.isEmpty {
                Text(entry)
                    .font(.body)
                    .lineLimit(2)
                    .foregroundColor(.primary)
            } else {
                Text("No journal entries yet. Start writing your travel stories!")
                    .font(.body)
                    .foregroundColor(.secondary)
            }
            Button("Open Journal") {
                // Navigation action to full journal
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(10)
        .padding(.horizontal)
    }
}

struct TravelJournalPreview_Previews: PreviewProvider {
    static var previews: some View {
        TravelJournalPreview(latestEntry: "Had a great time at the Golden Gate Bridge!")
            .previewLayout(.sizeThatFits)
    }
}