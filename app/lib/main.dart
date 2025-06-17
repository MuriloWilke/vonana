import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';

import 'firebase_options.dart';

import 'auth_gate.dart';
import 'screens/login_screen.dart';
import 'screens/main_screen.dart';

// The main entry point of the Flutter application
void main() async {
  // Ensures widget binding is initialized before calling Firebase
  WidgetsFlutterBinding.ensureInitialized();

  // Initializes Firebase using the platform-specific options
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  // Runs the app starting from the MyApp widget
  runApp(const MyApp());
}

// Root widget of the application
class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {

    const Color seedColor = Color(0xFF43C60F);

    final ColorScheme colorScheme = ColorScheme.fromSeed(
        seedColor: seedColor,
        primary: Color(0xFF43C60F),
        brightness: Brightness.light,
    );

    return MaterialApp(
      title: 'Vó Naná',

      // App-wide theme settings using Material 3
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: colorScheme,
        scaffoldBackgroundColor: colorScheme.surface,

        // App bar (top bar) styling
        appBarTheme: AppBarTheme(
          backgroundColor: colorScheme.primary,
          foregroundColor: colorScheme.onPrimary,

          titleTextStyle: TextStyle(
            color: colorScheme.onPrimary,
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),

        // Bottom navigation bar styling
        bottomNavigationBarTheme: BottomNavigationBarThemeData(
          selectedItemColor: colorScheme.onPrimary,
          unselectedItemColor: colorScheme.onPrimary.withOpacity(0.7),
          backgroundColor: colorScheme.primary,
        ),

      ),

      // The initial screen shown when the app starts
      home: const AuthGate(),

      // Named routes for navigation
      routes: {
        '/home': (context) => const MainScreen(),
        '/login': (context) => const LoginScreen(),
      },
    );
  }
}