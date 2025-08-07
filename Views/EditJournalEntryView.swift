import SwiftUI
import PhotosUI

struct EditJournalEntryView: View {
    var entry: JournalEntry
    var onSave: (JournalEntry) -> Void

    @State private var text: String
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var photoData: Data?
    @State private var entryDate: Date
    @Environment(\.dismiss) private var dismiss

    init(entry: JournalEntry, onSave: @escaping (JournalEntry) -> Void) {
        self.entry = entry
        self.onSave = onSave
        _text = State(initialValue: entry.text)
        _photoData = State(initialValue: entry.photoData)
        _entryDate = State(initialValue: entry.date)
    }

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
                Section(header: Text("Date")) {
                    DatePicker("Journal Date", selection: $entryDate, displayedComponents: .date)
                }
            }
            .navigationTitle("Edit Entry")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let updatedEntry = JournalEntry(
                            id: entry.id,
                            date: entryDate,
                            text: text,
                            photoData: photoData
                        )
                        onSave(updatedEntry)
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
