import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'orders_screen.dart';
import 'values_screen.dart';

/// Main screen widget that handles navigation between different screens
/// using a bottom navigation bar.
class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  // Currently selected index for the bottom navigation bar
  int _selectedIndex = 0;

  // List of widget options for each screen
  static final List<Widget> _widgetOptions = <Widget>[
    const OrdersScreen(),       // Screen to display orders
    const ValuesScreen(),       // Screen to configure product values
  ];

  // Updates the selected index when a navigation item is tapped
  void _onItemTapped(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  // Returns a title based on the selected tab index
  String _getTitleForIndex(int index) {
    switch (index) {
      case 0:
        return 'Vó Naná - Pedidos';
      case 1:
        return 'Vó Naná - Configurações de Valores';
      default:
        return 'Vó Naná';
    }
  }

  @override
  Widget build(BuildContext context) {

    return Scaffold(

      // App bar displays title and logout button
      appBar: AppBar(
        title: Text(_getTitleForIndex(_selectedIndex)),
        actions: [
          // Logout button in the top right corner
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              final navigator = Navigator.of(context);
              await FirebaseAuth.instance.signOut();
              navigator.pushReplacementNamed('/login');
            },
          ),
        ],
      ),

      // Main content area that changes based on selected tab
      body: Center(
        child: _widgetOptions.elementAt(_selectedIndex),
      ),

      // Bottom navigation bar wrapped with rounded corners
      bottomNavigationBar: ClipRRect(
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(20.0),
          topRight: Radius.circular(20.0),
        ),

        child: BottomNavigationBar(

          items: const <BottomNavigationBarItem>[
            BottomNavigationBarItem(
              icon: Icon(Icons.list_alt_rounded),
              label: 'Pedidos',
            ),

            BottomNavigationBarItem(
              icon: Icon(Icons.settings_suggest_rounded),
              label: 'Valores',
            ),
          ],

          currentIndex: _selectedIndex, // Currently selected tab
          onTap: _onItemTapped,         // Function to call when tab is tapped
        ),
      ),
    );
  }
}