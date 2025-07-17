import SwiftUI

struct TripsView: View {
    var body: some View {
        NavigationView {
            VStack {
                Text("Trips Tab")
                    .font(.title)
                    .padding()
                Text("Manage your upcoming and past trips here!")
                    .foregroundColor(.secondary)
            }
            .navigationTitle("Trips")
        }
    }
}
