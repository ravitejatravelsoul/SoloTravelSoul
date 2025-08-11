import SwiftUI

struct DiscoverInspirationView: View {
    let inspirations: [String] // image names or place names

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Discover Inspiration")
                .font(.headline)
                .padding(.leading)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(inspirations, id: \.self) { name in
                        VStack {
                            Image(name)
                                .resizable()
                                .frame(width: 80, height: 80)
                                .cornerRadius(10)
                            Text(name)
                                .font(.caption)
                                .lineLimit(1)
                        }
                        .frame(width: 90)
                        .background(Color(.systemGray6))
                        .cornerRadius(10)
                        .shadow(radius: 1)
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding(.vertical)
    }
}

struct DiscoverInspirationView_Previews: PreviewProvider {
    static var previews: some View {
        DiscoverInspirationView(inspirations: ["travel2", "travel3", "Bali"])
            .previewLayout(.sizeThatFits)
    }
}
