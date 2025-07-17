import SwiftUI

struct AttractionCardView: View {
    let attraction: Attraction

    var body: some View {
        VStack(alignment: .leading) {
            if let url = PlacesService.shared.photoURL(forReference: attraction.imageName) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        ProgressView()
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(height: 200)
                            .clipped()
                    case .failure:
                        Color.gray
                            .frame(height: 200)
                    @unknown default:
                        EmptyView()
                    }
                }
            } else {
                Color.gray
                    .frame(height: 200)
            }

            Text(attraction.name)
                .font(.headline)
                .padding(.top, 8)
            Text(attraction.description)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .padding(.bottom, 8)
        }
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(radius: 4)
        .padding(.horizontal)
    }
}
