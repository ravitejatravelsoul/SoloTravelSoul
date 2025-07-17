import SwiftUI

struct SectionHeader: View {
    let title: String
    let systemImage: String
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundColor(.blue)
            Text(title)
                .font(.headline)
        }
        .padding(.horizontal, 8)
        .padding(.top, 10)
    }
}

struct FieldDisplay: View {
    let text: String
    var body: some View {
        Text(text)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(12)
            .foregroundColor(text == "Not Set" ? .secondary : .primary)
            .padding(.horizontal, 8)
    }
}
