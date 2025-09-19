import SwiftUI

struct LoginForm: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ThemedCard {
            VStack(spacing: 16) {
                Text("Login")
                    .font(.title2)
                    .bold()
                    .foregroundColor(AppTheme.primary)
                ThemedTextField(text: $email, placeholder: "Email", keyboardType: .emailAddress)
                ThemedSecureField(text: $password, placeholder: "Password")
                if let error = authViewModel.errorMessage {
                    Text(error).foregroundColor(.red)
                }
                ThemedButton(isDisabled: email.isEmpty || password.isEmpty) {
                    authViewModel.signIn(email: email, password: password) { _ in }
                } label: {
                    Text("Log In")
                }
                if authViewModel.isLoading {
                    ProgressView()
                }
            }
        }
    }
}
