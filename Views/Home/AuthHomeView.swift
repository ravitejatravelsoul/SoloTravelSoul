import SwiftUI

struct AuthHomeView: View {
    @State private var showLogin = true
    @AppStorage("isLoggedIn") private var isLoggedIn = false

    var body: some View {
        VStack(spacing: 30) {
            CarouselView()
                .frame(height: 220)
                .padding(.top, 30)

            if showLogin {
                LoginForm {
                    isLoggedIn = true
                }
                Button("Don't have an account? Sign up") {
                    showLogin = false
                }
                .font(.footnote)
                .padding(.top, 4)
            } else {
                SignupForm {
                    isLoggedIn = true
                }
                Button("Already have an account? Log in") {
                    showLogin = true
                }
                .font(.footnote)
                .padding(.top, 4)
            }
            Spacer()
        }
        .padding()
    }
}

struct CarouselView: View {
    let images = ["travel1", "travel2", "travel3"] // Add your images to Assets

    @State private var index = 0

    var body: some View {
        TabView(selection: $index) {
            ForEach(0..<images.count, id: \.self) { idx in
                Image(images[idx])
                    .resizable()
                    .scaledToFill()
                    .tag(idx)
            }
        }
        .tabViewStyle(PageTabViewStyle())
        .indexViewStyle(PageIndexViewStyle())
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .shadow(radius: 6)
    }
}

struct LoginForm: View {
    var onSuccess: () -> Void
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
                onSuccess()
            }
            .buttonStyle(.borderedProminent)
            .disabled(email.isEmpty || password.isEmpty)
        }
    }
}

struct SignupForm: View {
    var onSuccess: () -> Void
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
            Button("Sign Up") {
                onSuccess()
            }
            .buttonStyle(.borderedProminent)
            .disabled(email.isEmpty || password.isEmpty)
        }
    }
}
