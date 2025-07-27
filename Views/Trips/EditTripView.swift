import SwiftUI
import MapKit

struct EditTripView: View {
    @Environment(\.presentationMode) var presentationMode
    @EnvironmentObject var tripViewModel: TripViewModel

    @StateObject private var searchViewModel: PlaceSearchViewModel

    @Binding var trip: PlannedTrip
    var onSave: (PlannedTrip) -> Void

    @State private var showPlacePicker = false

    init(trip: Binding<PlannedTrip>, onSave: @escaping (PlannedTrip) -> Void, tripViewModel: TripViewModel) {
        _trip = trip
        self.onSave = onSave
        _searchViewModel = StateObject(wrappedValue: PlaceSearchViewModel(tripViewModel: tripViewModel))
    }

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Destination")) {
                    TextField("Enter destination", text: $trip.destination)
                        .autocapitalization(.words)
                    Button("Search Place") {
                        showPlacePicker = true
                    }
                    if let placeName = trip.placeName, !placeName.isEmpty {
                        HStack {
                            Image(systemName: "mappin.and.ellipse")
                            Text(placeName)
                                .foregroundColor(.blue)
                        }
                    }
                }
                Section(header: Text("Dates")) {
                    DatePicker("Start Date", selection: $trip.startDate, displayedComponents: .date)
                    DatePicker("End Date", selection: $trip.endDate, displayedComponents: .date)
                }
                Section(header: Text("Notes")) {
                    TextField("Notes", text: $trip.notes)
                }
            }
            .navigationTitle("Edit Trip")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") {
                    presentationMode.wrappedValue.dismiss()
                },
                trailing: Button("Save") {
                    onSave(trip)
                    presentationMode.wrappedValue.dismiss()
                }
                .disabled(trip.destination.isEmpty)
            )
            .sheet(isPresented: $showPlacePicker) {
                PlacePickerView(searchViewModel: searchViewModel) { place in
                    trip.destination = place.name
                    trip.placeName = place.name
                    trip.latitude = place.latitude
                    trip.longitude = place.longitude
                    showPlacePicker = false
                }
            }
        }
    }
}
