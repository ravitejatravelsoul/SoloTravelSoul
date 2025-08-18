import SwiftUI

struct ToolbarMenuButton: ViewModifier {
    let menuOnRight: Bool
    let onMenu: () -> Void

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: menuOnRight ? .navigationBarTrailing : .navigationBarLeading) {
                    Button(action: onMenu) {
                        Image(systemName: "line.horizontal.3")
                            .imageScale(.large)
                            .accessibilityLabel("Menu")
                    }
                }
            }
    }
}

extension View {
    func menuButton(menuOnRight: Bool, onMenu: @escaping () -> Void) -> some View {
        self.modifier(ToolbarMenuButton(menuOnRight: menuOnRight, onMenu: onMenu))
    }
}
