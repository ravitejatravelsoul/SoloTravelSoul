import SwiftUI

struct TripJournalView: View {
    @ObservedObject var tripViewModel: TripViewModel
    var trip: PlannedTrip
    var day: ItineraryDay

    @State private var showAddEntry = false
    @State private var editingEntry: JournalEntry?

    var sortedEntries: [JournalEntry] {
        day.journalEntries.sorted { $0.date > $1.date }
    }

    var body: some View {
        List {
            ForEach(sortedEntries) { entry in
                VStack(alignment: .leading) {
                    Text(entry.text)
                        .font(.body)
                    if let photoData = entry.photoData, let image = UIImage(data: photoData) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .frame(height: 120)
                            .cornerRadius(8)
                    }
                    Text(entry.date, style: .date)
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                .onTapGesture {
                    editingEntry = entry
                }
            }
            .onDelete { indexSet in
                for idx in indexSet {
                    let entryId = sortedEntries[idx].id
                    tripViewModel.deleteJournalEntryFromDay(tripId: trip.id, dayId: day.id, entryId: entryId)
                }
            }
        }
        .navigationTitle("Journal for \(day.date, style: .date)")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showAddEntry = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showAddEntry) {
            AddJournalEntryView { entry in
                tripViewModel.addJournalEntryToDay(entry, tripId: trip.id, dayId: day.id)
                showAddEntry = false
            }
        }
        .sheet(item: $editingEntry) { entry in
            EditJournalEntryView(entry: entry) { updatedEntry in
                tripViewModel.updateJournalEntryInDay(updatedEntry, tripId: trip.id, dayId: day.id)
                editingEntry = nil
            }
        }
    }
}
