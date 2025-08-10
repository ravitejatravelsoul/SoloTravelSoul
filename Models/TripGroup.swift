//
//  TripGroup.swift
//  SoloTravelSoul
//
//  Created by Raviteja Vemulapelli on 8/7/25.
//


import Foundation

struct TripGroup: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var name: String
    var destination: String
    var startDate: Date
    var endDate: Date
    var description: String?
    var imageURL: String?
    var activities: [String]
    var members: [UserProfile] // UserProfile is your user model
    var requests: [UserProfile] // pending join requests
    var creator: UserProfile
}