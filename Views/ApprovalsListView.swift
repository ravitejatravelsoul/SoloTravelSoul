import SwiftUI

struct ApprovalsListView: View {
    let approvals: [ApprovalItem]

    var body: some View {
        List(approvals) { approval in
            Text("Approval: \(approval.title)")
        }
        .navigationTitle("Approvals")
    }
}
