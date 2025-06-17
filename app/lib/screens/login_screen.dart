import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

/// This screen allows users to log in using email and password.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {

  // Firebase Authentication instance
  final FirebaseAuth _auth = FirebaseAuth.instance;

  // Controllers to handle user input for email and password fields
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  // Holds the error message if sign-in fails
  String? _errorMessage;

  /// Attempts to sign in the user using Firebase Authentication
  Future<void> _signIn() async {
    try {
      // Attempt to sign in using email and password
      UserCredential userCredential = await _auth.signInWithEmailAndPassword(
        email: _emailController.text.trim(),
        password: _passwordController.text.trim(),
      );

      // If user is authenticated successfully and widget is still mounted,
      // navigate to the home screen
      if (userCredential.user != null && mounted) {
        Navigator.pushReplacementNamed(context, '/home');
      }
    } on FirebaseAuthException catch (e) {
      // Display Firebase-specific authentication error message
      setState(() {
        _errorMessage = e.message;
      });
    } catch (e) {
      setState(() {
        _errorMessage = "Ocorreu um erro inesperado.";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Login")),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [

            // Email input field
            TextField(
              controller: _emailController,
              decoration: const InputDecoration(
                labelText: "Email",
                labelStyle: TextStyle(fontSize: 16),
              ),
              keyboardType: TextInputType.emailAddress,
              style: const TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 10),

            // Password input field
            TextField(
              controller: _passwordController,
              decoration: const InputDecoration(
                labelText: "Senha",
                labelStyle: TextStyle(fontSize: 16),
              ),
              obscureText: true,
              style: const TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 20),

            // Display error message if present
            if (_errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 10.0),
                child: Text(
                  _errorMessage!,
                  style: const TextStyle(color: Colors.red),
                  textAlign: TextAlign.center,
                ),
              ),

            // Login button
            ElevatedButton(
              onPressed: _signIn,
              child: const Text("Entrar"),
            ),
          ],
        ),
      ),
    );
  }
}