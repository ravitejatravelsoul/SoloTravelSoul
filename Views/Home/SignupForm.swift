//
//  SignupForm.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/16/25.
//


import SwiftUI

struct SignupForm: View {
    @AppStorage("isLoggedIn") private var isLoggedIn = false
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var dob = Date()
    @State private var address = ""
    @State private var stateOfResidence = ""
    @State private var email = ""
    @State private var password = ""

    let states = ["California", "Texas", "Florida", "New York", "Washington"]

    var isFormValid: Bool {
        !firstName.isEmpty &&
        !lastName.isEmpty &&
        !address.isEmpty &&
        !stateOfResidence.isEmpty &&
        !email.isEmpty &&
        !password.isEmpty
    }

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                TextField("First Name", text: $firstName)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                TextField("Last Name", text: $lastName)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
            }
            DatePicker("Date of Birth", selection: $dob, displayedComponents: .date)
            TextField("Address", text: $address)
                .textFieldStyle(RoundedBorderTextFieldStyle())
            Picker("State of Residence", selection: $stateOfResidence) {
                Text("Select a state").tag("")
                ForEach(states, id: \.self) { state in
                    Text(state).tag(state)
                }
            }
            .pickerStyle(MenuPickerStyle())
            TextField("Email", text: $email)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .textFieldStyle(RoundedBorderTextFieldStyle())
            SecureField("Password", text: $password)
                .textFieldStyle(RoundedBorderTextFieldStyle())
            Button("Sign Up") {
                if isFormValid {
                    isLoggedIn = true
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!isFormValid)
        }
    }
}
