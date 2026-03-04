import 'package:flutter/material.dart';

import 'package:firebase_auth/firebase_auth.dart';

import 'screens/login_screen.dart';
import 'screens/main_screen.dart';

// AuthGate is a widget that determines whether the user is authenticated.
// It shows either the LoginScreen or the MainScreen based on the authentication state.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(

      // Listens to changes in the authentication state of the user.
      // This stream emits a new value whenever the user's auth state changes (e.g., login, logout).
      stream: FirebaseAuth.instance.authStateChanges(),

      // The builder rebuilds the UI whenever a new auth state is emitted.
      builder: (context, snapshot) {

        // While waiting for the authentication check to complete, show a loading spinner.
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(
              child: CircularProgressIndicator(),
            ),
          );
        }

        // If there's no authenticated user, show the login screen.
        if (!snapshot.hasData || snapshot.data == null) {
          return const LoginScreen();
        }

        // If the user is authenticated, show the main screen.
        return const MainScreen();
      },
    );
  }
}