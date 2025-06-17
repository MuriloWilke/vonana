import 'package:flutter/material.dart';

import 'package:intl/intl.dart';

import '../models/order_model.dart';
import '../widgets/order_card.dart';

// Firebase imports
import 'package:cloud_firestore/cloud_firestore.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key, this.title});

  final String? title;

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {

  DateTime _selectedDate = DateTime.now();
  bool _hasOverdueOrders = false;
  List<DateTime> _overdueDates = [];

  @override
  void initState() {
    super.initState();
    _selectedDate = _getNextValidOrderDay(DateTime.now());
    _checkForOverdueOrders();
  }

  /// Check for overdue orders (orders before today)
  Future<void> _checkForOverdueOrders() async {
    final today = DateTime.now();
    final snapshot = await FirebaseFirestore.instance
        .collection('orders')
        .where('deliveryStatus', isEqualTo: 'Pendente')
        .where('deliveryDate', isLessThan: Timestamp.fromDate(
        DateTime(today.year, today.month, today.day)))
        .get();

    if (snapshot.docs.isNotEmpty) {
      final Set<DateTime> dates = snapshot.docs.map((doc) {
        final ts = doc['deliveryDate'] as Timestamp;
        final d = ts.toDate();
        return DateTime(d.year, d.month, d.day);
      }).toSet();

      setState(() {
        _hasOverdueOrders = true;
        _overdueDates = dates.toList()..sort();
      });
    }
  }

  /// Build Firestore stream for the selected date only
  Stream<QuerySnapshot> _ordersStreamForDate(DateTime date) {
    final start = DateTime(date.year, date.month, date.day);
    final end = start.add(const Duration(days: 1));

    return FirebaseFirestore.instance
        .collection('orders')
        .where('deliveryDate', isGreaterThanOrEqualTo: Timestamp.fromDate(start))
        .where('deliveryDate', isLessThan: Timestamp.fromDate(end))
        .where('deliveryStatus', isEqualTo: 'Pendente')
        .orderBy('creationDate', descending: true)
        .snapshots();
  }

  DateTime _getNextValidOrderDay(DateTime from) {
    final validDays = [DateTime.monday, DateTime.thursday, DateTime.saturday];

    if (validDays.contains(from.weekday)) {
      return from;
    }

    DateTime next = from.add(const Duration(days: 1));
    while (!validDays.contains(next.weekday)) {
      next = next.add(const Duration(days: 1));
    }

    return next;
  }

  @override
  Widget build(BuildContext context) {

    // Collecting the orders stream based on the selected date
    final stream = _ordersStreamForDate(_selectedDate);

    return Column(
      children: [

        if (_hasOverdueOrders)
          Container(
            color: Colors.red.shade100,
            padding: const EdgeInsets.all(8),
            margin: const EdgeInsets.all(10),
            child: Row(
              children: [
                const Icon(Icons.warning_amber_rounded, color: Colors.red),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Existem pedidos atrasados para os dia(s):\n' +
                        _overdueDates.map((d) => DateFormat('dd/MM/yy').format(d)).join(', '),
                    style: const TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),

        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Pedidos de: ${DateFormat('dd/MM/yy').format(_selectedDate)}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            IconButton(
              icon: const Icon(Icons.calendar_today),
              onPressed: () async {
                DateTime? picked = await showDatePicker(
                  context: context,
                  initialDate: _selectedDate,
                  firstDate: DateTime(2023),
                  lastDate: DateTime(2100),
                  selectableDayPredicate: (DateTime date) {
                    return [DateTime.monday, DateTime.thursday, DateTime.saturday].contains(date.weekday);
                  },
                );
                if (picked != null) {
                  setState(() {
                    _selectedDate = picked;
                  });
                }
              },
            )
          ],
        ),

        Expanded(
          child: StreamBuilder<QuerySnapshot>(
            stream: stream,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return Center(child: Text('Erro: ${snapshot.error}'));
              }

              if (snapshot.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }

              final docs = snapshot.data?.docs ?? [];

              if (docs.isEmpty) {
                return const Center(child: Text('Nenhum pedido encontrado.'));
              }

              return ListView(
                children: docs.map((doc) {
                  final order = OrderModel.fromFirestore(doc);
                  return OrderCard(order: order);
                }).toList(),
              );
            },
          ),
        ),
      ],
    );
  }
}