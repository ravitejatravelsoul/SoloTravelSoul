//
//  EditField.swift
//  SoloTravelSoul
//
//  Created by Raviteja on 8/29/25.
//


import SwiftUI

struct EditField: View {
    @Binding var text: String
    var placeholder: String
    var keyboardType: UIKeyboardType = .default
    var body: some View {
        TextField(placeholder, text: $text)
            .padding(12)
            .background(AppTheme.card)
            .cornerRadius(12)
            .keyboardType(keyboardType)
            .padding(.horizontal, 8)
    }
}

struct SectionHeader: View {
    let title: String
    let systemImage: String
    var body: some View {
        HStack {
            Image(systemName: systemImage)
                .foregroundColor(AppTheme.primary)
            Text(title)
                .font(.headline)
                .foregroundColor(AppTheme.primary)
            Spacer()
        }
        .padding(.horizontal, 8)
    }
}

struct FieldDisplay: View {
    let text: String
    var body: some View {
        HStack {
            Text(text)
                .foregroundColor(text.contains("Select") ? .gray : .primary)
            Spacer()
        }
        .padding(12)
        .background(AppTheme.card)
        .cornerRadius(12)
        .padding(.horizontal, 8)
    }
}

struct SheetPicker: View {
    let title: String
    let options: [String]
    @Binding var searchText: String
    @Binding var selected: String
    var onDone: () -> Void

    var filtered: [String] {
        if searchText.isEmpty { return options }
        return options.filter { $0.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                TextField("Search \(title.lowercased())...", text: $searchText)
                    .padding()
                    .background(AppTheme.chipBackground)
                    .cornerRadius(10)
                    .padding(.top, 16)
                    .padding(.horizontal, 16)
                List {
                    ForEach(filtered, id: \.self) { option in
                        Button {
                            selected = option
                            onDone()
                        } label: {
                            HStack {
                                Text(option)
                                if selected == option {
                                    Spacer()
                                    Image(systemName: "checkmark")
                                        .foregroundColor(AppTheme.primary)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.insetGrouped)
                Button("Done") { onDone() }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(AppTheme.primary)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct MultiSheetPicker: View {
    let title: String
    let options: [String]
    @Binding var selected: Set<String>
    var onDone: () -> Void
    @State private var searchText: String = ""

    var filtered: [String] {
        if searchText.isEmpty { return options }
        return options.filter { $0.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                TextField("Search \(title.lowercased())...", text: $searchText)
                    .padding()
                    .background(AppTheme.chipBackground)
                    .cornerRadius(10)
                    .padding(.top, 16)
                    .padding(.horizontal, 16)
                List {
                    ForEach(filtered, id: \.self) { option in
                        Button {
                            if selected.contains(option) {
                                selected.remove(option)
                            } else {
                                selected.insert(option)
                            }
                        } label: {
                            HStack {
                                Text(option)
                                Spacer()
                                if selected.contains(option) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(AppTheme.primary)
                                } else {
                                    Image(systemName: "circle")
                                        .foregroundColor(.gray)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(.insetGrouped)
                Button("Done") { onDone() }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(AppTheme.primary)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}