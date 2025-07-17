import SwiftUI

struct LoginView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var showAlert = false
    @State private var alertMessage = ""
    @AppStorage("isLoggedIn") private var isLoggedIn = false

    func validateCredentials(email: String, password: String) -> Bool {
        // Accept any non-empty email and password for now
        return !email.isEmpty && !password.isEmpty
    }

    var body: some View {
        VStack(spacing: 20) {
            Text("Login")
                .font(.largeTitle)
                .padding(.top)

            TextField("Email", text: $email)
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .padding(.horizontal)

            SecureField("Password", text: $password)
                .textFieldStyle(RoundedBorderTextFieldStyle())
                .padding(.horizontal)

            Button(action: {
                if validateCredentials(email: email, password: password) {
                    isLoggedIn = true
                    alertMessage = "Login successful!"
                } else {
                    alertMessage = "Email and password cannot be empty."
                }
                showAlert = true
            }) {
                Text("Login")
                    .font(.headline)
                    .foregroundColor(.white)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color.blue)
                    .cornerRadius(10)
                    .padding(.horizontal)
            }
            .disabled(email.isEmpty || password.isEmpty)
            .alert(isPresented: $showAlert) {
                Alert(title: Text("Login"),
                      message: Text(alertMessage),
                      dismissButton: .default(Text("OK")))
            }

            Spacer()
        }
        .navigationTitle("Login")
    }
}
