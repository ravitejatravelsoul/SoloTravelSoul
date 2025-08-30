import SwiftUI
import PhotosUI

struct ProfileScreen: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var showEditProfile = false
    @State private var showEditAvatar = false
    @State private var profileUser: UserProfile

    init(user: UserProfile) {
        _profileUser = State(initialValue: user)
    }

    var body: some View {
        ZStack {
            AppTheme.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 28) {
                    // --- Profile Hero ---
                    ZStack(alignment: .topTrailing) {
                        ProfileHeroView(user: profileUser)
                            .frame(height: 220)
                            .padding(.bottom, -32)
                        // Edit profile pic button
                        Button(action: { showEditAvatar = true }) {
                            Image(systemName: "camera.fill")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(AppTheme.primary)
                                .padding(10)
                                .background(AppTheme.card)
                                .clipShape(Circle())
                                .shadow(color: AppTheme.shadow, radius: 4, x: 0, y: 2)
                        }
                        .offset(x: -30, y: 18)
                        .sheet(isPresented: $showEditAvatar) {
                            EditProfileView(
                                user: profileUser,
                                isAvatarOnly: true,
                                onSave: { newUser in
                                    self.profileUser = newUser
                                }
                            ).environmentObject(authViewModel)
                        }
                    }

                    // --- About Card ---
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Text("About Me")
                                .font(.headline)
                                .foregroundColor(AppTheme.primary)
                            Spacer()
                            Button(action: { showEditProfile = true }) {
                                Image(systemName: "pencil")
                                    .foregroundColor(AppTheme.primary)
                            }
                        }
                        Text(profileUser.bio.isEmpty ? "No bio provided." : profileUser.bio)
                            .font(AppTheme.bodyFont)
                            .foregroundColor(AppTheme.textSecondary)
                        Divider().padding(.vertical, 4)
                        HStack(spacing: 32) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Birthday")
                                    .font(.caption)
                                    .foregroundColor(AppTheme.textSecondary)
                                Text(profileUser.birthday.isEmpty ? "Not set" : profileUser.birthday)
                                    .font(.body)
                                    .foregroundColor(AppTheme.textPrimary)
                            }
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Languages")
                                    .font(.caption)
                                    .foregroundColor(AppTheme.textSecondary)
                                Text(profileUser.languages.isEmpty ? "Not set" : profileUser.languages)
                                    .font(.body)
                                    .foregroundColor(AppTheme.textPrimary)
                            }
                        }
                    }
                    .padding()
                    .background(AppTheme.card)
                    .cornerRadius(AppTheme.cardCornerRadius)
                    .shadow(color: AppTheme.shadow, radius: 6, x: 0, y: 2)
                    .sheet(isPresented: $showEditProfile) {
                        EditProfileView(
                            user: profileUser,
                            isAvatarOnly: false,
                            onSave: { newUser in
                                self.profileUser = newUser
                            }
                        ).environmentObject(authViewModel)
                    }

                    // --- Preferences Mood Board ---
                    if !profileUser.preferences.isEmpty {
                        ProfileMoodBoardView(
                            title: "Preferences",
                            items: profileUser.preferences.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                        )
                    }
                    // --- Favorite Destinations Mood Board ---
                    if !profileUser.favoriteDestinations.isEmpty {
                        ProfileMoodBoardView(
                            title: "Favorite Destinations",
                            items: profileUser.favoriteDestinations.components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                        )
                    }

                    // --- Social Links ---
                    if !profileUser.socialLinks.isEmpty {
                        HStack(spacing: 8) {
                            Image(systemName: "link")
                                .foregroundColor(AppTheme.accent)
                            Text(profileUser.socialLinks)
                                .font(.footnote)
                                .foregroundColor(AppTheme.primary)
                                .underline()
                        }
                        .padding(.top, 8)
                    }
                }
                .padding(.horizontal)
                .padding(.top, 16)
            }
        }
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
    }
}
