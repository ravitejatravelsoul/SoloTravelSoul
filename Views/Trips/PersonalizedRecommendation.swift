import SwiftUI

struct PersonalizedRecommendationsView: View {
    let city: String
    let recommendations: [PersonalizedRecommendation]
    let onAdd: (PersonalizedRecommendation) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Popular This Season in \(city)")
                .font(.headline)
                .padding(.leading, 16)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 18) {
                    ForEach(recommendations) { rec in
                        VStack {
                            Image(rec.imageName)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 140, height: 90)
                                .clipped()
                                .cornerRadius(12)
                            Text(rec.title)
                                .font(.subheadline.bold())
                            Text(rec.description)
                                .font(.caption)
                                .lineLimit(2)
                                .foregroundColor(.secondary)
                            Button("Add to Trip") {
                                onAdd(rec)
                            }
                            .font(.caption2)
                            .buttonStyle(.borderedProminent)
                        }
                        .frame(width: 150)
                    }
                }
                .padding(.horizontal)
            }
        }
    }
}
