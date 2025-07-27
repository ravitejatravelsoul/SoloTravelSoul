//
//  SuggestPlaceSearchSection.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/25/25.
//


import SwiftUI

struct SuggestPlaceSearchSection: View {
    @ObservedObject var searchViewModel: PlaceSearchViewModel
    var onAdd: (Place) -> Void
    @State private var selectedPlace: Place? = nil

    var body: some View {
        VStack(alignment: .leading) {
            TextField("Search for places...", text: $searchViewModel.searchText)
                .textFieldStyle(RoundedBorderTextFieldStyle())

            if searchViewModel.isLoading {
                ProgressView("Searching...")
            }

            if let error = searchViewModel.errorMessage {
                Text(error).foregroundColor(.red)
            }

            ForEach(searchViewModel.results) { place in
                HStack {
                    VStack(alignment: .leading) {
                        Text(place.name)
                            .font(.subheadline)
                        if let address = place.address {
                            Text(address)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    Spacer()
                    Button("Add") { onAdd(place) }
                        .buttonStyle(.borderedProminent)
                    Button {
                        selectedPlace = place
                    } label: {
                        Image(systemName: "info.circle")
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .sheet(item: $selectedPlace) { place in
            NavigationStack {
                PlaceDetailView(place: place, onAddToItinerary: {
                    onAdd(place)
                })
            }
        }
    }
}
