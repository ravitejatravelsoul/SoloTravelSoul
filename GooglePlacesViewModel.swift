import Foundation
import Combine

class GooglePlacesViewModel: ObservableObject {
    @Published var searchText: String = ""
    @Published var places: [Place] = []
    @Published var isLoading: Bool = false

    private let service = GooglePlacesService()
    private var cancellables = Set<AnyCancellable>()

    init() {
        $searchText
            .debounce(for: .milliseconds(350), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { [weak self] text in
                self?.searchPlaces(query: text)
            }
            .store(in: &cancellables)
    }

    func searchPlaces(query: String) {
        guard !query.isEmpty else {
            places = []
            return
        }
        isLoading = true
        service.fetchPlaces(for: query) { [weak self] results in
            DispatchQueue.main.async {
                self?.isLoading = false
                self?.places = results
            }
        }
    }
}
