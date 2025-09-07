import SwiftUI

struct GoogleSuggestionsView: View {
    let suggestions: [GooglePlaceSuggestion]
    let onAdd: (GooglePlaceSuggestion) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Suggestions Near You")
                .font(.headline)
                .padding(.leading, 16)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 18) {
                    ForEach(suggestions) { suggestion in
                        VStack {
                            if let url = suggestion.photoURL {
                                AsyncImage(url: url) { phase in
                                    switch phase {
                                    case .success(let image):
                                        image
                                            .resizable()
                                            .scaledToFill()
                                    default:
                                        Image(systemName: "photo")
                                            .resizable()
                                            .scaledToFit()
                                            .foregroundColor(.gray)
                                    }
                                }
                                .frame(width: 120, height: 80)
                                .clipped()
                                .cornerRadius(12)
                            } else {
                                Image(systemName: "photo")
                                    .resizable()
                                    .frame(width: 120, height: 80)
                                    .foregroundColor(.gray)
                                    .cornerRadius(12)
                            }
                            Text(suggestion.name)
                                .font(.subheadline.bold())
                                .padding(.top, 4)
                            if let desc = suggestion.description {
                                Text(desc)
                                    .font(.caption)
                                    .lineLimit(2)
                                    .foregroundColor(.secondary)
                            }
                            Button("Add to Trip") {
                                onAdd(suggestion)
                            }
                            .font(.caption2)
                            .buttonStyle(.borderedProminent)
                        }
                        .frame(width: 140)
                        .padding(.vertical, 8)
                    }
                }
                .padding(.horizontal)
            }
        }
        .padding(.vertical)
    }
}
