import 'package:flutter/material.dart';

import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:csv/csv.dart';
import 'dart:io';

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
  bool _isLoadingRoute = false;

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
        .where('deliveryDate',
          isLessThan:
            Timestamp.fromDate(DateTime(today.year, today.month, today.day)))
        .get();

    if (snapshot.docs.isNotEmpty) {
      final Set<DateTime> dates = snapshot.docs.map((doc) {
        final ts = doc['deliveryDate'] as Timestamp;
        final d = ts.toDate();
        return DateTime(d.year, d.month, d.day);
      }).toSet();

      if (mounted) {
        setState(() {
          _hasOverdueOrders = true;
          _overdueDates = dates.toList()
            ..sort();
        });
      }
    } else {
      if (mounted) {
        setState(() {
          _hasOverdueOrders = false;
          _overdueDates = [];
        });
      }
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

  /// Generates the spreadsheet whit the routs of the day and share it.
  Future<void> _generateAndShareRouteSheet() async {
    setState(() {
      _isLoadingRoute = true;
    });

    try {
      // 1. Find the orders from the selected day
      final start = DateTime(_selectedDate.year, _selectedDate.month, _selectedDate.day);
      final end = start.add(const Duration(days: 1));

      final snapshot = await FirebaseFirestore.instance
          .collection('orders')
          .where('deliveryDate', isGreaterThanOrEqualTo: Timestamp.fromDate(start))
          .where('deliveryDate', isLessThan: Timestamp.fromDate(end))
          .where('deliveryStatus', isEqualTo: 'Pendente')
          .get();

      if (snapshot.docs.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Nenhum pedido pendente para gerar rota nesta data.')),
          );
        }
        return;
      }

      // 2. Prepare the data to the CSV
      List<List<dynamic>> rows = [];

      rows.add(['Customer Name', 'Street Address', 'City', 'State', 'ZIP Code']);

      for (var doc in snapshot.docs) {
        final order = OrderModel.fromFirestore(doc);
        final address = order.shippingAddress;

        final String city = (address.city != null && address.city!.isNotEmpty)
            ? address.city!
            : address.subadminArea ?? "";
        final String customerName = address.businessName ?? "";
        final String street = address.streetAddress ?? "";
        final String state = address.adminArea ?? "";
        final String zip = address.zipCode ?? "";

        rows.add([
          customerName,
          street,
          city,
          state,
          zip,
        ]);
      }

      // 3. Convert to a string in CSV format
      String csv = const ListToCsvConverter().convert(rows);

      // 4. Save the archive in a temporary directory
      final tempDir = await getTemporaryDirectory();
      final dateString = DateFormat('dd-MM-yyyy').format(_selectedDate);
      final filePath = '${tempDir.path}/rota_circuit_$dateString.csv';
      final file = File(filePath);
      await file.writeAsString(csv);

      // 5. Share the archive
      final xFile = XFile(filePath, mimeType: 'text/csv', name: 'rota_circuit_$dateString.csv');
      await Share.shareXFiles([xFile], text: 'Aqui está a rota de entregas do dia $dateString.');

    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao gerar a rota: $e')),
        );
      }
    } finally {
      setState(() {
        _isLoadingRoute = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {

    // Collecting the orders stream based on the selected date
    final stream = _ordersStreamForDate(_selectedDate);

    return Scaffold(
        appBar: widget.title != null ? AppBar(title: Text(widget.title!)) : null,
        body: Column(
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
                    return OrderCard(
                      order: order,
                      onOrderConcluded: _checkForOverdueOrders,
                    );
                  }).toList(),
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _isLoadingRoute ? null : _generateAndShareRouteSheet,
        label: _isLoadingRoute
            ? const Text('Gerando...')
            : const Text('Gerar Rota do Dia'),
        icon: _isLoadingRoute
            ? const SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: Colors.white,
          ),
        )
            : const Icon(Icons.route_outlined),
        backgroundColor: _isLoadingRoute ? Colors.grey : Theme.of(context).primaryColor,
      ),
    );
  }
}