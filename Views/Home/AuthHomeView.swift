import SwiftUI

struct AuthHomeView: View {
    @State private var showLogin = true

    var body: some View {
        VStack(spacing: 30) {
            CarouselView()
                .frame(height: 220)
                .padding(.top, 30)

            if showLogin {
                LoginForm()
                Button("Don't have an account? Sign up") {
                    showLogin = false
                }
                .font(.footnote)
                .padding(.top, 4)
            } else {
                SignupForm()
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
