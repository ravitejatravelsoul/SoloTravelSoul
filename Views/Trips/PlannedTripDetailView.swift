import SwiftUI

struct PlannedTripDetailView: View {
    var plannedTrip: PlannedTrip
    var onSave: ((PlannedTrip) -> Void)?

    @State private var notes: String

    init(plannedTrip: PlannedTrip, onSave: ((PlannedTrip) -> Void)? = nil) {
        self.plannedTrip = plannedTrip
        self.onSave = onSave
        _notes = State(initialValue: plannedTrip.notes)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(plannedTrip.destination)
                .font(.largeTitle)
                .bold()
            Text("Start Date: \(plannedTrip.startDate, formatter: dateFormatter)")
            Text("End Date: \(plannedTrip.endDate, formatter: dateFormatter)")

            TextField("Notes", text: $notes)
                .textFieldStyle(RoundedBorderTextFieldStyle())

            Button("Save") {
                var updatedTrip = plannedTrip
                updatedTrip.notes = notes
                onSave?(updatedTrip)
            }
            .padding(.top)

            Spacer()
        }
        .padding()
        .navigationTitle("Trip Details")
    }

    private var dateFormatter: DateFormatter {
        let df = DateFormatter()
        df.dateStyle = .medium
        return df
    }
}
