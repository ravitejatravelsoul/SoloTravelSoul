import SwiftUI

struct IconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 12) {
            configuration.icon
                .foregroundColor(.blue)
                .font(.system(size: 19, weight: .medium))
            configuration.title
                .foregroundColor(.black)
                .font(.system(size: 17))
        }
    }
}
