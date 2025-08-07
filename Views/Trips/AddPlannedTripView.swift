import SwiftUI
import PhotosUI
import MapKit

struct AddPlannedTripView: View {
    @Environment(\.dismiss) var dismiss
    @State private var destination = ""
    @State private var startDate = Date()
    @State private var endDate = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var notes = ""
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var selectedCoordinate: CLLocationCoordinate2D?

    var onAdd: (PlannedTrip) -> Void

    var body: some View {
        NavigationView {
            Form {
                Section(header: Label("Destination", systemImage: "mappin.and.ellipse")) {
                    TextField("e.g. Paris, Tokyo, Sydney", text: $destination)
                        .autocapitalization(.words)
                }
                Section(header: Label("Start Date", systemImage: "calendar")) {
                    DatePicker("Trip Start", selection: $startDate, displayedComponents: .date)
                        .accentColor(.accentColor)
                }
                Section(header: Label("End Date", systemImage: "calendar")) {
                    DatePicker("Trip End", selection: $endDate, in: startDate..., displayedComponents: .date)
                        .accentColor(.accentColor)
                }
                Section(header: Label("Notes", systemImage: "note.text")) {
                    TextEditor(text: $notes)
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
                        if let photoData,
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
                                    photoData = data
                                }
                            }
                        }
                    }
                }
                Section(header: Label("Map Location (optional)", systemImage: "map")) {
                    LocationPickerView(coordinate: $selectedCoordinate)
                        .frame(height: 180)
                }
            }
            .navigationTitle("Add Trip")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        let trip = PlannedTrip(
                            id: UUID(),
                            destination: destination,
                            startDate: startDate,
                            endDate: endDate,
                            notes: notes,
                            itinerary: [],
                            photoData: photoData,
                            latitude: selectedCoordinate?.latitude,
                            longitude: selectedCoordinate?.longitude,
                            placeName: nil,
                            members: [] // <-- Added members argument
                        )
                        onAdd(trip)
                        dismiss()
                    } label: {
                        Label("Save", systemImage: "checkmark")
                    }
                    .disabled(destination.trimmingCharacters(in: .whitespaces).isEmpty)
                    .buttonStyle(.borderedProminent)
                }
            }
        }
    }
}
