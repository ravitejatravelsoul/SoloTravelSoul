import SwiftUI

struct ContentView: View {
    @AppStorage("isLoggedIn") private var isLoggedIn = false

    var body: some View {
        if isLoggedIn {
            RootTabView()
        } else {
            AuthHomeView()
        }
    }
}
