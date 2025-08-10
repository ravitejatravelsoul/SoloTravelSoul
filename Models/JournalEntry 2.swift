//
//  JournalEntry 2.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 8/9/25.
//


import Foundation

public struct JournalEntry: Identifiable, Codable, Hashable {
    public let id: UUID
    public var date: Date
    public var text: String
    public var photoData: Data?

    public init(id: UUID = UUID(), date: Date, text: String, photoData: Data? = nil) {
        self.id = id
        self.date = date
        self.text = text
        self.photoData = photoData
    }
}

public struct ItineraryDay: Identifiable, Codable, Hashable {
    public let id: UUID
    public var date: Date
    public var places: [Place]
    public var journalEntries: [JournalEntry]

    public init(id: UUID = UUID(), date: Date, places: [Place], journalEntries: [JournalEntry] = []) {
        self.id = id
        self.date = date
        self.places = places
        self.journalEntries = journalEntries
    }
}

public struct PlannedTrip: Identifiable, Codable, Hashable {
    public let id: UUID
    public var destination: String
    public var startDate: Date
    public var endDate: Date
    public var notes: String
    public var itinerary: [ItineraryDay]
    public var photoData: Data?
    public var latitude: Double?
    public var longitude: Double?
    public var placeName: String?
    public var members: [String]
    public var isPlanned: Bool { true }

    public var allPlaces: [Place] {
        itinerary.flatMap { $0.places }
    }

    public mutating func setOptimizedPlaces(_ places: [Place]) {
        guard !itinerary.isEmpty else { return }
        let days = itinerary.count
        let perDay = max(1, places.count / days)
        var placesCopy = places
        for i in 0..<days {
            let slice = Array(placesCopy.prefix(perDay))
            itinerary[i].places = slice
            placesCopy = Array(placesCopy.dropFirst(perDay))
        }
        if !placesCopy.isEmpty {
            itinerary[days-1].places += placesCopy
        }
    }
}