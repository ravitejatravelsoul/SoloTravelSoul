import SwiftUI
import MapKit

struct PlannedTripDetailView: View {
    let trip: PlannedTrip
    var onEdit: (() -> Void)? = nil

    @State private var region: MKCoordinateRegion

    init(trip: PlannedTrip, onEdit: (() -> Void)? = nil) {
        self.trip = trip
        self.onEdit = onEdit
        if let lat = trip.latitude, let lon = trip.longitude {
            _region = State(initialValue: MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                span: MKCoordinateSpan(latitudeDelta: 0.3, longitudeDelta: 0.3)
            ))
        } else {
            _region = State(initialValue: MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 20, longitude: 0),
                span: MKCoordinateSpan(latitudeDelta: 30, longitudeDelta: 30)
            ))
        }
    }

    var body: some View {
        ScrollView {
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

                if let lat = trip.latitude, let lon = trip.longitude {
                    Map(initialPosition: .region(region)) {
                        Marker(trip.destination,
                               coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon))
                    }
                    .frame(height: 200)
                    .cornerRadius(12)
                }

                Text(trip.notes)
                    .font(.body)
                    .padding()
                Spacer()
                if let onEdit = onEdit {
                    Button {
                        onEdit()
                    } label: {
                        Label("Edit Plan", systemImage: "pencil")
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.bottom)
                }
            }
            .padding()
        }
        .navigationTitle(trip.destination)
    }
}
