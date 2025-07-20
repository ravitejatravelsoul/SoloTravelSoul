import Foundation

let apiKey = "AIzaSyDzEFLJgGcUbed7oMOBhqP57E8KsKKdtbk" // replace this

let url = URL(string: "https://places.googleapis.com/v1/places:searchText?key=\(apiKey)")!
var request = URLRequest(url: url)
request.httpMethod = "POST"
request.addValue("application/json", forHTTPHeaderField: "Content-Type")
request.addValue("*", forHTTPHeaderField: "X-Goog-FieldMask")

let requestBody: [String: Any] = [
    "textQuery": "museum",
    "pageSize": 1,
    "languageCode": "en"
]

request.httpBody = try! JSONSerialization.data(withJSONObject: requestBody, options: [])

print("Headers being sent:", request.allHTTPHeaderFields ?? [:])

let task = URLSession.shared.dataTask(with: request) { data, response, error in
    if let data = data, let raw = String(data: data, encoding: .utf8) {
        print("Response:\n\(raw)")
    }
    if let error = error {
        print("Error:", error)
    }
}
task.resume()
RunLoop.main.run() // keep playground running
