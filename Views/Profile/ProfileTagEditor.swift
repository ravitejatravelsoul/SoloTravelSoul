import SwiftUI

struct ProfileTagEditor: View {
    let title: String
    @Binding var items: [String]
    var suggestions: [String] = []
    @State private var newItem: String = ""
    @State private var selectedSuggestion: String = ""
    var placeholder: String = "Add new..."

    var body: some View {
        VStack(alignment: .leading) {
            Text(title)
                .font(.headline)

            // Chips for selected items
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(items, id: \.self) { item in
                        HStack(spacing: 2) {
                            Text(item)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Capsule().fill(Color.blue.opacity(0.15)))
                            Button(action: {
                                if let idx = items.firstIndex(of: item) {
                                    items.remove(at: idx)
                                }
                            }) {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.red)
                            }
                        }
                    }
                }
            }

            // Dropdown picker for suggestions
            if !suggestions.isEmpty {
                Picker("Select \(title)", selection: $selectedSuggestion) {
                    Text("Select \(title)").tag("")
                    ForEach(suggestions.filter { !items.contains($0) }, id: \.self) { suggestion in
                        Text(suggestion).tag(suggestion)
                    }
                }
                .pickerStyle(MenuPickerStyle())
                // Fix: Update to iOS 17+ onChange signature
                .onChange(of: selectedSuggestion) { oldValue, newValue in
                    if !newValue.isEmpty && !items.contains(newValue) {
                        items.append(newValue)
                        selectedSuggestion = ""
                    }
                }
            }

            // Manual text field for custom entry
            HStack {
                TextField(placeholder, text: $newItem)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                Button(action: {
                    let trimmed = newItem.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty && !items.contains(trimmed) {
                        items.append(trimmed)
                        newItem = ""
                    }
                }) {
                    Image(systemName: "plus.circle.fill")
                        .foregroundColor(.green)
                        .font(.title2)
                }
                .disabled(newItem.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(.vertical, 8)
    }
}
