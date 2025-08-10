import SwiftUI

struct LoginForm: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 16) {
            Text("Login")
                .font(.title2)
                .bold()
            TextField("Email", text: $email)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .textFieldStyle(RoundedBorderTextFieldStyle())
            SecureField("Password", text: $password)
                .textFieldStyle(RoundedBorderTextFieldStyle())
            if let error = authViewModel.errorMessage {
                Text(error).foregroundColor(.red)
            }
            Button("Log In") {
                authViewModel.signIn(email: email, password: password) { success in
                    // Do nothing; view will update on login state change
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(email.isEmpty || password.isEmpty)
            if authViewModel.isLoading {
                ProgressView()
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .shadow(radius: 4)
    }
}
