import SwiftUI

struct QuickAction: Identifiable {
    let id = UUID()
    let title: String
    let icon: String
    let action: () -> Void
}

struct QuickActionsView: View {
    let actions: [QuickAction]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 24) {
                ForEach(actions) { action in
                    Button(action: action.action) {
                        VStack(spacing: 8) {
                            Image(systemName: action.icon)
                                .resizable()
                                .frame(width: 32, height: 32)
                                .foregroundColor(.accentColor)
                            Text(action.title)
                                .font(.caption)
                                .foregroundColor(.primary)
                        }
                        .padding(.vertical, 8)
                        .frame(width: 84)
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                    }
                }
            }
            .padding(.horizontal)
        }
        .padding(.vertical)
    }
}
