import SwiftUI

struct CarouselView: View {
    let images = ["travel1", "travel2", "travel3"] // Ensure these images exist in Assets.xcassets
    @State private var index = 0

    var body: some View {
        TabView(selection: $index) {
            ForEach(0..<images.count, id: \.self) { idx in
                Image(images[idx])
                    .resizable()
                    .scaledToFill()
                    .tag(idx)
            }
        }
        .tabViewStyle(PageTabViewStyle())
        .indexViewStyle(PageIndexViewStyle())
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .shadow(radius: 6)
    }
}
