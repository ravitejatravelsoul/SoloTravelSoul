import SwiftUI
import MapKit

struct LocationPickerView: View {
    @Binding var coordinate: CLLocationCoordinate2D?
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 20, longitude: 0),
        span: MKCoordinateSpan(latitudeDelta: 30, longitudeDelta: 30)
    )

    var body: some View {
        Map(initialPosition: .region(region)) {
            if let coord = coordinate {
                Marker("Selected", coordinate: coord)
            }
        }
        .gesture(
            TapGesture().onEnded {
                coordinate = region.center
            }
        )
        .frame(height: 200)
        .cornerRadius(12)
        .overlay(
            Text("Pan & tap to set map location")
                .font(.caption2)
                .foregroundColor(.gray)
                .padding(4),
            alignment: .top
        )
    }
}
