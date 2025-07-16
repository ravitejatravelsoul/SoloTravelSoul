//
//  TravelHistoryView.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/15/25.
//


import SwiftUI
import PhotosUI

struct TravelHistoryView: View {
    @AppStorage("trips") private var tripsData: String = ""
    @State private var trips: [Trip] = []
    @State private var showAddTrip = false

    func loadTrips() -> [Trip] {
        (try? JSONDecoder().decode([Trip].self, from: Data(tripsData.utf8))) ?? []
    }
    func saveTrips(_ trips: [Trip]) {
        if let data = try? JSONEncoder().encode(trips) {
            tripsData = String(data: data, encoding: .utf8) ?? ""
        }
    }

    var body: some View {
        NavigationView {
            List {
                if trips.isEmpty {
                    VStack(alignment: .center) {
                        Text("No trips logged yet.")
                            .foregroundColor(.secondary)
                            .padding()
                    }
                    .frame(maxWidth: .infinity, alignment: .center)
                } else {
                    ForEach(trips.sorted(by: { $0.date > $1.date })) { trip in
                        NavigationLink(destination: TripDetailView(trip: trip)) {
                            HStack {
                                if let photoData = trip.photoData, let uiImage = UIImage(data: photoData) {
                                    Image(uiImage: uiImage)
                                        .resizable()
                                        .aspectRatio(contentMode: .fill)
                                        .frame(width: 60, height: 60)
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                } else {
                                    Image(systemName: "airplane")
                                        .resizable()
                                        .aspectRatio(contentMode: .fit)
                                        .frame(width: 44, height: 44)
                                        .foregroundColor(.blue)
                                        .padding(8)
                                }
                                VStack(alignment: .leading) {
                                    Text(trip.destination)
                                        .font(.headline)
                                    Text(trip.date, style: .date)
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                    .onDelete(perform: deleteTrips)
                }
            }
            .navigationTitle("Travel History")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showAddTrip = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddTrip, onDismiss: {
                trips = loadTrips()
            }) {
                AddTripView { newTrip in
                    trips.append(newTrip)
                    saveTrips(trips)
                }
            }
            .onAppear {
                trips = loadTrips()
            }
        }
    }

    func deleteTrips(at offsets: IndexSet) {
        trips.remove(atOffsets: offsets)
        saveTrips(trips)
    }
}

struct TripDetailView: View {
    let trip: Trip

    var body: some View {
        VStack(spacing: 20) {
            if let data = trip.photoData, let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: 300, maxHeight: 200)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .shadow(radius: 6)
            }
            Text(trip.destination)
                .font(.title)
                .fontWeight(.bold)
            Text(trip.date, style: .date)
                .font(.headline)
                .foregroundColor(.secondary)
            ScrollView {
                Text(trip.notes)
                    .font(.body)
                    .padding()
            }
            Spacer()
        }
        .padding()
        .navigationTitle(trip.destination)
    }
}