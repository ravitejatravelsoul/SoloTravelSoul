import SwiftUI

fileprivate func googlePlacePhotoURL(photoReference: String, maxWidth: Int = 400) -> URL? {
    let apiKey = "AIzaSyD7ysvfoeInF3mr9tO3IfRx1K5EfFK2XQU"
    let urlString = "https://maps.googleapis.com/maps/api/place/photo?maxwidth=\(maxWidth)&photoreference=\(photoReference)&key=\(apiKey)"
    return URL(string: urlString)
}

struct PlannedTripDetailView: View {
    var plannedTrip: PlannedTrip
    var onSave: ((PlannedTrip) -> Void)? = nil

    @State private var notes: String

    init(plannedTrip: PlannedTrip, onSave: ((PlannedTrip) -> Void)? = nil) {
        self.plannedTrip = plannedTrip
        self.onSave = onSave
        _notes = State(initialValue: plannedTrip.notes)
    }

    var imageURL: URL? {
        if let firstPlace = plannedTrip.itinerary.first?.places.first,
           let photoRef = firstPlace.photoReferences?.first,
           !photoRef.isEmpty
        {
            return googlePlacePhotoURL(photoReference: photoRef, maxWidth: 400)
        }
        return nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Trip image
                if let url = imageURL {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        } else if phase.error != nil {
                            Color.gray.opacity(0.2)
                                .overlay(Image(systemName: "photo").foregroundColor(.red))
                        } else {
                            Color.gray.opacity(0.2)
                                .overlay(ProgressView())
                        }
                    }
                    .frame(height: 180)
                    .cornerRadius(14)
                }

                Text(plannedTrip.destination)
                    .font(.largeTitle)
                    .bold()
                Text("Start Date: \(plannedTrip.startDate, formatter: dateFormatter)")
                Text("End Date: \(plannedTrip.endDate, formatter: dateFormatter)")

                Divider()
                Text("Going: \(plannedTrip.members.count) people")
                    .font(.subheadline)
                if !plannedTrip.members.isEmpty {
                    ForEach(plannedTrip.members, id: \.self) { member in
                        Text(member).font(.caption)
                    }
                }

                Divider()
                Text("Planned Places:").font(.headline)
                ForEach(plannedTrip.itinerary.flatMap { $0.places }) { place in
                    VStack(alignment: .leading) {
                        Text(place.name)
                            .font(.body)
                        if let address = place.address {
                            Text(address)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    Divider()
                }

                // Show notes in read-only mode, but allow editing if you want
                Text("Notes").font(.headline)
                TextField("Notes", text: $notes)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .disabled(onSave == nil)

                if let onSave {
                    Button("Save") {
                        var updatedTrip = plannedTrip
                        updatedTrip.notes = notes
                        onSave(updatedTrip)
                    }
                    .padding(.top)
                }

                Spacer()
            }
            .padding()
        }
        .navigationTitle("Trip Details")
    }

    private var dateFormatter: DateFormatter {
        let df = DateFormatter()
        df.dateStyle = .medium
        return df
    }
}
