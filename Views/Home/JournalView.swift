//
//  JournalView.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 7/24/25.
//


import SwiftUI

struct JournalView: View {
    var body: some View {
        NavigationStack {
            Text("Your Travel Journal")
                .font(.largeTitle)
                .padding()
        }
    }
}

struct JournalView_Previews: PreviewProvider {
    static var previews: some View {
        JournalView()
    }
}
