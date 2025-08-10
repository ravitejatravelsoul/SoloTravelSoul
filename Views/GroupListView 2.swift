//
//  GroupListView 2.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 8/7/25.
//


import SwiftUI

struct GroupListView: View {
    @ObservedObject var groupViewModel: GroupViewModel
    @State private var showCreateGroup = false
    @State private var selectedGroup: TripGroup? = nil

    var body: some View {
        NavigationView {
            List {
                ForEach(groupViewModel.groups) { group in
                    Button {
                        selectedGroup = group
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(group.name).font(.headline)
                                Text(group.destination).font(.subheadline)
                                Text("\(group.startDate, style: .date) - \(group.endDate, style: .date)").font(.caption)
                            }
                            Spacer()
                            Text("\(group.members.count) members")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Trip Groups")
            .toolbar {
                Button(action: { showCreateGroup = true }) {
                    Image(systemName: "plus")
                }
            }
            .sheet(isPresented: $showCreateGroup) {
                CreateGroupView(groupViewModel: groupViewModel)
            }
            .sheet(item: $selectedGroup) { group in
                GroupDetailView(group: group, groupViewModel: groupViewModel)
            }
        }
    }
}