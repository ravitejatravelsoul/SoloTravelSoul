import SwiftUI

struct ProfileMoodBoardView: View {
    let title: String
    let items: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
                .foregroundColor(AppTheme.primary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(items, id: \.self) { item in
                        Text(item)
                            .padding(.vertical, 6)
                            .padding(.horizontal, 14)
                            .background(AppTheme.accent.opacity(0.18))
                            .foregroundColor(AppTheme.primary)
                            .cornerRadius(16)
                    }
                }
            }
        }
        .padding(.vertical, 8)
    }
}
