import SwiftUI

struct NotificationBadgeView: View {
    let count: Int
    var body: some View {
        if count > 0 {
            Text("\(count)")
                .font(.caption2)
                .foregroundColor(.white)
                .padding(6)
                .background(Color.red)
                .clipShape(Circle())
                .offset(x: 10, y: -10)
        } else {
            EmptyView()
        }
    }
}
