import SwiftUI

struct UserProfile: Identifiable, Equatable {
    let id: String
    let name: String
    // Add any additional fields as needed for your app (e.g., avatarURL, email, etc.)
}

struct PickerDemo: View {
    let users: [UserProfile] = [
        UserProfile(id: "1", name: "Alice"),
        UserProfile(id: "2", name: "Bob"),
        UserProfile(id: "3", name: "Charlie")
    ]
    @State private var showPicker = false
    @State private var selectedUserId: String? = nil

    var body: some View {
        VStack {
            Button("Show Picker") { showPicker = true }
            .sheet(isPresented: $showPicker, onDismiss: { selectedUserId = nil }) {
                NavigationView {
                    VStack {
                        Picker("Select User", selection: $selectedUserId) {
                            ForEach(users, id: \.id) { user in
                                Text(user.name).tag(user.id as String?)
                            }
                        }
                        .pickerStyle(.wheel)
                        .frame(height: 120)
                        Button("Continue") {
                            // Example action: print selected user's name
                            if let selectedId = selectedUserId,
                               let user = users.first(where: { $0.id == selectedId }) {
                                print("Selected user:", user.name)
                            }
                            showPicker = false
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(selectedUserId == nil)
                        Spacer()
                    }
                    .padding()
                    .navigationTitle("Select User")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") {
                                showPicker = false
                                selectedUserId = nil
                            }
                        }
                    }
                }
            }
        }
    }
}

struct PickerDemo_Previews: PreviewProvider {
    static var previews: some View {
        PickerDemo()
    }
}
