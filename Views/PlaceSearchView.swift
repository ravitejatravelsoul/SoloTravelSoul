import SwiftUI

struct PlaceSearchView: View {
    @State private var searchText = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var places: [Place] = []
    @FocusState private var isTextFieldFocused: Bool

    var body: some View {
        NavigationView {
            VStack {
                HStack {
                    TextField("Search for places or attractions", text: $searchText, onCommit: fetchPlaces)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .padding()
                        .focused($isTextFieldFocused)

                    if isLoading {
                        ProgressView()
                            .padding(.trailing, 8)
                    }
                }

                if let error = errorMessage {
                    Text(error)
                        .foregroundColor(.red)
                        .padding()
                }

                List(places) { place in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(place.name)
                            .font(.headline)
                        if let addr = place.address {
                            Text(addr)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        if let rating = place.rating {
                            HStack(spacing: 2) {
                                Image(systemName: "star.fill")
                                    .font(.caption)
                                    .foregroundColor(.yellow)
                                Text(String(format: "%.1f", rating))
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                if let count = place.userRatingsTotal {
                                    Text("(\(count))")
                                        .font(.caption2)
                                        .foregroundColor(.gray)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listStyle(.plain)
            }
            .navigationTitle("Search Places")
        }
    }

    func fetchPlaces() {
        guard !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        errorMessage = nil
        isLoading = true
        places = []
        Task {
            do {
                let results = try await GooglePlacesService.shared.searchPlaces(query: searchText)
                await MainActor.run {
                    places = results
                    isLoading = false
                    isTextFieldFocused = false
                    print("Places loaded: \(results.count)")
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                    print("Error: \(error.localizedDescription)")
                }
            }
        }
    }
}

#Preview {
    PlaceSearchView()
}
