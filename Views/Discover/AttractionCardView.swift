//
//  AttractionCardView.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/16/25.
//


import SwiftUI

struct AttractionCardView: View {
    let attraction: Attraction
    
    @State private var image: Image? = nil
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let url = photoURL(for: attraction.imageName) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        ProgressView()
                            .frame(height: 120)
                    case .success(let img):
                        img
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(height: 120)
                            .clipped()
                    case .failure:
                        Image(systemName: "photo")
                            .resizable()
                            .scaledToFit()
                            .frame(height: 120)
                            .foregroundColor(.gray.opacity(0.3))
                    @unknown default:
                        EmptyView()
                    }
                }
                .cornerRadius(12)
            } else {
                Image(systemName: "photo.on.rectangle")
                    .resizable()
                    .scaledToFit()
                    .frame(height: 120)
                    .foregroundColor(.gray.opacity(0.2))
            }
            Text(attraction.name)
                .font(.headline)
            Text(attraction.description)
                .font(.subheadline)
                .foregroundColor(.secondary)
            if let lat = attraction.latitude, let lon = attraction.longitude {
                HStack(spacing: 6) {
                    Image(systemName: "mappin.and.ellipse")
                        .foregroundColor(.accentColor)
                    Text(String(format: "%.3f, %.3f", lat, lon))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.vertical, 6)
    }
    
    func photoURL(for ref: String) -> URL? {
        // Use the same logic as in PlacesService
        guard !ref.isEmpty else { return nil }
        let apiKey = PlacesService.shared.apiKey
        let urlString = "https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=\(ref)&key=\(apiKey)"
        return URL(string: urlString)
    }
}
