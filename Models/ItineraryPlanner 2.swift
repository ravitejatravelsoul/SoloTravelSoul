import Foundation

struct ItineraryPlanner {
    static func autoPlan(
        places: [Place],
        foodSpots: [Place],
        trip: PlannedTrip
    ) -> (itinerary: [ItineraryDay], suggestions: [Place]) {
        var scheduled: Set<String> = []
        var result: [ItineraryDay] = []
        let dates = trip.startDate.days(until: trip.endDate)
        let isOneDay = dates.count == 1

        // Sort main places (could use optimizer)
        var attractions = places.sorted { ($0.rating ?? 0) > ($1.rating ?? 0) }
        var foods = foodSpots.shuffled()

        for (idx, date) in dates.enumerated() {
            var dayPlaces: [Place] = []

            // Arrival/departure special handling
            if idx == 0 && !isOneDay {
                dayPlaces.append(
                    Place(
                        id: "arrive",
                        name: "Arrive in \(trip.destination) anytime.",
                        address: nil,
                        latitude: 0,
                        longitude: 0,
                        types: nil,
                        rating: nil,
                        userRatingsTotal: nil,
                        photoReferences: nil,
                        reviews: nil,
                        openingHours: nil,
                        phoneNumber: nil,
                        website: nil,
                        journalEntries: nil,
                        category: "info"
                    )
                )
                result.append(ItineraryDay(date: date, places: dayPlaces))
                continue // skip sightseeing on arrival day
            }
            if idx == dates.count - 1 && !isOneDay {
                // Add morning places, then
                dayPlaces.append(contentsOf: popAttractions(&attractions, max: 2, scheduled: &scheduled))
                dayPlaces.append(
                    Place(
                        id: "depart",
                        name: "Finish sightseeing by 4pm. Depart at your convenience.",
                        address: nil,
                        latitude: 0,
                        longitude: 0,
                        types: nil,
                        rating: nil,
                        userRatingsTotal: nil,
                        photoReferences: nil,
                        reviews: nil,
                        openingHours: nil,
                        phoneNumber: nil,
                        website: nil,
                        journalEntries: nil,
                        category: "info"
                    )
                )
                result.append(ItineraryDay(date: date, places: insertFood(dayPlaces, foods: &foods)))
                continue
            }
            // Otherwise, fill attractions (max 4), interleave food
            let count = isOneDay ? 3 : 4
            dayPlaces.append(contentsOf: popAttractions(&attractions, max: count, scheduled: &scheduled))
            result.append(ItineraryDay(date: date, places: insertFood(dayPlaces, foods: &foods)))
        }

        return (result, attractions) // leftovers as suggestions
    }

    // Helper to pop up to max attractions, mark them scheduled
    static func popAttractions(_ attractions: inout [Place], max: Int, scheduled: inout Set<String>) -> [Place] {
        var result: [Place] = []
        var i = 0
        while i < attractions.count && result.count < max {
            let p = attractions[i]
            if !scheduled.contains(p.id) {
                result.append(p)
                scheduled.insert(p.id)
            }
            i += 1
        }
        attractions.removeAll(where: { scheduled.contains($0.id) })
        return result
    }

    // Helper to insert food between places
    static func insertFood(_ places: [Place], foods: inout [Place]) -> [Place] {
        guard !foods.isEmpty else { return places }
        var result: [Place] = []
        for (i, place) in places.enumerated() {
            result.append(place)
            // Insert food after every 2nd attraction, lunch/dinner
            if (i == 1 || i == 3), let food = foods.popLast() {
                var foodPlace = food
                foodPlace.category = "food"
                result.append(foodPlace)
            }
        }
        return result
    }
}

// Helper to get list of dates between two dates (inclusive)
extension Date {
    func days(until end: Date) -> [Date] {
        guard self <= end else { return [] }
        var dates: [Date] = []
        var current = self
        let cal = Calendar.current
        repeat {
            dates.append(current)
            current = cal.date(byAdding: .day, value: 1, to: current)!
        } while current <= end
        return dates
    }
}
