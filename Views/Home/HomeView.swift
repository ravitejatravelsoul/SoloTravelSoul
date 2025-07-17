import SwiftUI

struct HomeView: View {
    var body: some View {
        VStack(spacing: 30) {
            CarouselView()
                .frame(height: 220)
                .padding(.top, 30)
            // Add any home page content here
            Spacer()
        }
        .padding()
    }
}
