//
//  ChangePasswordView.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/16/25.
//


import SwiftUI

struct ChangePasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var oldPassword: String = ""
    @State private var newPassword: String = ""
    @State private var confirmPassword: String = ""
    @State private var error: String = ""
    @State private var showError: Bool = false

    var body: some View {
        NavigationView {
            Form {
                SecureField("Old Password", text: $oldPassword)
                SecureField("New Password", text: $newPassword)
                SecureField("Confirm New Password", text: $confirmPassword)

                Button("Change Password") {
                    // Simple validation; integrate with backend for real app
                    guard !oldPassword.isEmpty, !newPassword.isEmpty, !confirmPassword.isEmpty else {
                        error = "All fields required."; showError = true; return
                    }
                    guard newPassword == confirmPassword else {
                        error = "New passwords do not match."; showError = true; return
                    }
                    // TODO: Backend password update
                    dismiss()
                }
            }
            .navigationTitle("Change Password")
            .alert(error, isPresented: $showError) {
                Button("OK", role: .cancel) {}
            }
        }
    }
}
