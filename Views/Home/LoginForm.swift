//
//  LoginForm.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/16/25.
//


import SwiftUI

struct LoginForm: View {
    @AppStorage("isLoggedIn") private var isLoggedIn = false
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 16) {
            TextField("Email", text: $email)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .textFieldStyle(RoundedBorderTextFieldStyle())
            SecureField("Password", text: $password)
                .textFieldStyle(RoundedBorderTextFieldStyle())
            Button("Log In") {
                if !email.isEmpty && !password.isEmpty {
                    isLoggedIn = true
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(email.isEmpty || password.isEmpty)
        }
    }
}
