import SwiftUI
import PhotosUI
import MapKit

struct EditPlannedTripView: View {
    @Environment(\.dismiss) var dismiss
    @Binding var trip: PlannedTrip
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var selectedCoordinate: CLLocationCoordinate2D?

    var onSave: (PlannedTrip) -> Void

    var body: some View {
        NavigationView {
            Form {
                Section(header: Label("Destination", systemImage: "mappin.and.ellipse")) {
                    TextField("e.g. Paris, Tokyo, Sydney", text: $trip.destination)
                        .autocapitalization(.words)
                }
                Section(header: Label("Start Date", systemImage: "calendar")) {
                    DatePicker("Trip Start", selection: $trip.startDate, displayedComponents: .date)
                        .accentColor(.accentColor)
                }
                Section(header: Label("End Date", systemImage: "calendar")) {
                    DatePicker("Trip End", selection: $trip.endDate, in: trip.startDate..., displayedComponents: .date)
                        .accentColor(.accentColor)
                }
                Section(header: Label("Notes", systemImage: "note.text")) {
                    TextEditor(text: $trip.notes)
                        .frame(height: 80)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.secondary.opacity(0.2))
                        )
                        .background(Color(.secondarySystemBackground))
                        .cornerRadius(8)
                }
                Section(header: Label("Photo (optional)", systemImage: "camera")) {
                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        if let photoData = trip.photoData,
                           let uiImage = UIImage(data: photoData) {
                            Image(uiImage: uiImage)
                                .resizable()
                                .scaledToFit()
                                .frame(height: 100)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        } else {
                            HStack {
                                Image(systemName: "photo")
                                    .foregroundColor(.accentColor)
                                Text("Select Photo")
                                    .foregroundColor(.accentColor)
                            }
                            .frame(height: 50)
                        }
                    }
                    .onChange(of: selectedPhoto) { _, newValue in
                        if let newItem = newValue {
                            Task {
                                if let data = try? await newItem.loadTransferable(type: Data.self) {
                                    trip.photoData = data
                                }
                            }
                        }
                    }
                }
                Section(header: Label("Map Location (optional)", systemImage: "map")) {
                    LocationPickerView(
                        coordinate: Binding<CLLocationCoordinate2D?>(
                            get: {
                                if let lat = trip.latitude, let lon = trip.longitude {
                                    return CLLocationCoordinate2D(latitude: lat, longitude: lon)
                                }
                                return selectedCoordinate
                            },
                            set: { newCoord in
                                selectedCoordinate = newCoord
                                trip.latitude = newCoord?.latitude
                                trip.longitude = newCoord?.longitude
                            }
                        )
                    )
                    .frame(height: 180)
                }
            }
            .navigationTitle("Edit Trip")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        onSave(trip)
                        dismiss()
                    } label: {
                        Label("Save", systemImage: "checkmark")
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
    }
}
