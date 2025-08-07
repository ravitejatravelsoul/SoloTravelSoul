
import SwiftUI
import PhotosUI

struct EditJournalEntryView: View {
    var onSave: (JournalEntry) -> Void
    @State private var text: String = ""
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var photoData: Data?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Journal Entry")) {
                    TextEditor(text: $text)
                        .frame(height: 80)
                }
                Section(header: Text("Photo (optional)")) {
                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        if let photoData,
                           let uiImage = UIImage(data: photoData) {
                            Image(uiImage: uiImage)
                                .resizable()
                                .scaledToFit()
                                .frame(height: 120)
                                .cornerRadius(8)
                        } else {
                            Text("Select Photo")
                        }
                    }
                    .onChange(of: selectedPhoto) { _, newValue in
                        if let item = newValue {
                            Task {
                                if let data = try? await item.loadTransferable(type: Data.self) {
                                    photoData = data
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Add Entry")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let entry = JournalEntry(
                            date: Date(),
                            text: text,
                            photoData: photoData
                        )
                        onSave(entry)
                        dismiss()
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
