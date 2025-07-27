import SwiftUI

struct JournalView: View {
    let latestEntry: String
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Your Travel Journal")
                .font(.largeTitle)
            if latestEntry.isEmpty {
                Text("No journal entries yet.")
                    .foregroundColor(.secondary)
            } else {
                Text(latestEntry)
                    .font(.body)
            }
            Spacer()
        }
        .padding()
        .navigationTitle("Travel Journal")
    }
}

struct JournalView_Previews: PreviewProvider {
    static var previews: some View {
        JournalView(latestEntry: "Had a great time at the Golden Gate Bridge!")
    }
}
