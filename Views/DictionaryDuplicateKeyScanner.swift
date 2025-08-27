import Foundation

/// Utility to check for duplicate keys in dictionary literals at runtime.
func scanForDuplicateKeys<T, U>(_ dict: [T: U], file: String = #file, line: Int = #line) {
    var keyCounts: [T: Int] = [:]
    for key in dict.keys {
        keyCounts[key, default: 0] += 1
    }
    let duplicates = keyCounts.filter { $0.value > 1 }
    if !duplicates.isEmpty {
        print("⚠️ DUPLICATE DICTIONARY KEYS DETECTED in \(file):\(line):")
        for (key, count) in duplicates {
            print("  - Key '\(key)' appears \(count) times")
        }
        assertionFailure("Duplicate dictionary keys found at runtime.")
    }
}
