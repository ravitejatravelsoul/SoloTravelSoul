import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        Group {
            if authViewModel.user != nil {
                RootTabView()
            } else {
                AuthHomeView()
            }
        }
    }
}
