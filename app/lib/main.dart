import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';

import 'firebase_options.dart';

import 'auth_gate.dart';
import 'screens/login_screen.dart';
import 'screens/main_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  runApp(const MyApp());
}

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

      theme: ThemeData(
        useMaterial3: true,
        colorScheme: colorScheme,
        scaffoldBackgroundColor: colorScheme.surface,

        appBarTheme: AppBarTheme(
          backgroundColor: colorScheme.primary,
          foregroundColor: colorScheme.onPrimary,

          titleTextStyle: TextStyle(
            color: colorScheme.onPrimary,
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),

        bottomNavigationBarTheme: BottomNavigationBarThemeData(
          selectedItemColor: colorScheme.onPrimary,
          unselectedItemColor: colorScheme.onPrimary.withAlpha((255 * 0.7).round()),
          backgroundColor: colorScheme.primary,
        ),

      ),

      home: const AuthGate(),

      routes: {
        '/home': (context) => const MainScreen(),
        '/login': (context) => const LoginScreen(),
      },
    );
  }
}