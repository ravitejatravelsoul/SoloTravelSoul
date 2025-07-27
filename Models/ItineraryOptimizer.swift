import Foundation
import CoreLocation

struct ItineraryOptimizer {
    /// Orders places to minimize total travel distance (Greedy Nearest Neighbor)
    static func optimizeRoute(places: [Place]) -> [Place] {
        guard !places.isEmpty else { return [] }
        var unvisited = places
        var route: [Place] = []
        var current = unvisited.removeFirst()
        route.append(current)
        while !unvisited.isEmpty {
            let nearestIndex = unvisited.enumerated().min(by: { a, b in
                distance(from: current, to: a.element) < distance(from: current, to: b.element)
            })!.offset
            current = unvisited.remove(at: nearestIndex)
            route.append(current)
        }
        return route
    }

    static func distance(from: Place, to: Place) -> Double {
        let loc1 = CLLocation(latitude: from.latitude, longitude: from.longitude)
        let loc2 = CLLocation(latitude: to.latitude, longitude: to.longitude)
        return loc1.distance(from: loc2)
    }
}
