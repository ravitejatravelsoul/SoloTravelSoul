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

struct CarouselView: View {
    let images = ["travel1", "travel2", "travel3"] // Make sure these images exist in Assets.xcassets

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
    @AppStorage("isLoggedIn") private var isLoggedIn = false
    @State private var email = ""
    @State private var password = ""
    @State private var showAlert = false

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
            Button("Log In") {
                if !email.isEmpty && !password.isEmpty {
                    isLoggedIn = true
                } else {
                    showAlert = true
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(email.isEmpty || password.isEmpty)
            .alert(isPresented: $showAlert) {
                Alert(title: Text("Login Failed"),
                      message: Text("Please enter both email and password."),
                      dismissButton: .default(Text("OK")))
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .shadow(radius: 4)
    }
}

struct SignupForm: View {
    @AppStorage("isLoggedIn") private var isLoggedIn = false
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var dob = Date()
    @State private var address = ""
    @State private var stateOfResidence = ""
    @State private var email = ""
    @State private var password = ""
    @State private var showAlert = false

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
            Text("Sign Up")
                .font(.title2)
                .bold()
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
                } else {
                    showAlert = true
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!isFormValid)
            .alert(isPresented: $showAlert) {
                Alert(title: Text("Sign Up Failed"),
                      message: Text("Please fill all fields."),
                      dismissButton: .default(Text("OK")))
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .shadow(radius: 4)
    }
}
