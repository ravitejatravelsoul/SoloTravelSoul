import SwiftUI

struct ExploreView: View {
    var body: some View {
        NavigationView {
            VStack {
                Text("Explore Tab")
                    .font(.title)
                    .padding()
                Text("Discover new destinations and experiences!")
                    .foregroundColor(.secondary)
            }
            .navigationTitle("Explore")
        }
    }
}
