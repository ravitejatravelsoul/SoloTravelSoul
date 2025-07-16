//
//  DiscoverView.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/16/25.
//


import SwiftUI
import CoreLocation

struct DiscoverView: View {
    @State private var selectedState: String = "California"
    @State private var city: String = ""
    @State private var selectedInterest: String = "Beach"
    @State private var isLoading: Bool = false
    @State private var results: [Attraction] = []
    @State private var errorMessage: String?
    
    // Hardcoded for demo; you can expand
    let states = ["California", "Texas", "Florida", "New York", "Washington"]
    let interests = ["Beach", "Hiking", "Park", "Museum", "Restaurant"]
    
    var body: some View {
        NavigationView {
            VStack {
                Form {
                    Section(header: Text("Choose Location")) {
                        Picker("State", selection: $selectedState) {
                            ForEach(states, id: \.self) { state in
                                Text(state)
                            }
                        }
                        TextField("City (optional)", text: $city)
                            .autocapitalization(.words)
                    }
                    Section(header: Text("Interest")) {
                        Picker("Interest", selection: $selectedInterest) {
                            ForEach(interests, id: \.self) { interest in
                                Text(interest)
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                }
                Button {
                    findAttractions()
                } label: {
                    Label("Find", systemImage: "magnifyingglass.circle.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal)
                .disabled(isLoading)
                if isLoading {
                    ProgressView("Searching...")
                        .padding()
                }
                if let error = errorMessage {
                    Text(error)
                        .foregroundColor(.red)
                        .padding()
                }
                List(results) { attraction in
                    AttractionCardView(attraction: attraction)
                }
                .listStyle(PlainListStyle())
            }
            .navigationTitle("Discover")
        }
    }
    
    func findAttractions() {
        isLoading = true
        errorMessage = nil
        results = []
        
        // For demo, use the center of the state as coordinates
        let lookup: [String: CLLocationCoordinate2D] = [
            "California": .init(latitude: 36.7783, longitude: -119.4179),
            "Texas": .init(latitude: 31.9686, longitude: -99.9018),
            "Florida": .init(latitude: 27.9944, longitude: -81.7603),
            "New York": .init(latitude: 43.0000, longitude: -75.0000),
            "Washington": .init(latitude: 47.7511, longitude: -120.7401)
        ]
        let location = lookup[selectedState] ?? CLLocationCoordinate2D(latitude: 37.0, longitude: -120.0)
        let keyword = selectedInterest
        
        // Optionally, you can use city geocoding here for more accurate results
        
        PlacesService.shared.fetchAttractions(
            keyword: keyword,
            location: location
        ) { attractions, error in
            DispatchQueue.main.async {
                isLoading = false
                if let error = error {
                    errorMessage = error.localizedDescription
                } else if let attractions = attractions {
                    results = attractions
                    if results.isEmpty {
                        errorMessage = "No results found. Try another interest or location."
                    }
                }
            }
        }
    }
}
