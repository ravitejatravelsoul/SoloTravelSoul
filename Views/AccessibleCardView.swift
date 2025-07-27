//
//  AccessibleCardView.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/26/25.
//


import SwiftUI

struct AccessibleCardView<Content: View>: View {
    let content: Content
    let action: (() -> Void)?
    let accessibilityLabel: String
    let accessibilityHint: String?

    init(
        accessibilityLabel: String,
        accessibilityHint: String? = nil,
        action: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.accessibilityLabel = accessibilityLabel
        self.accessibilityHint = accessibilityHint
        self.action = action
        self.content = content()
    }

    var body: some View {
        Group {
            if let action = action {
                Button(action: action) {
                    cardBody
                }
                .buttonStyle(.plain)
            } else {
                cardBody
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint(accessibilityHint ?? "")
        .background(Color("CardBackground"))
        .cornerRadius(14)
        .shadow(color: Color.primary.opacity(0.08), radius: 4, x: 0, y: 2)
        .padding(.vertical, 4)
        .padding(.horizontal)
    }

    private var cardBody: some View {
        content
            .padding()
            .frame(minHeight: 60)
    }
}