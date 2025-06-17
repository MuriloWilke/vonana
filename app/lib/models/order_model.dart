import 'package:cloud_firestore/cloud_firestore.dart';
import 'order_item_model.dart';
import 'shipping_address_model.dart';

/// Model representing an entire order
class OrderModel {
  final String id;                              // Firestore document ID (order ID)
  final String clientId;                        // ID of the client placing the order
  final Timestamp creationDate;                 // Timestamp when the order was created
  final Timestamp deliveryDate;                 // Delivery date
  final String deliveryStatus;                  // Status of the delivery (e.g., pending, delivered)
  final List<OrderItemModel> items;             // List of items in the order
  final String paymentMethod;                   // Payment method used (e.g., Pix, cash)
  final ShippingAddressModel shippingAddress;   // Shipping address details
  final int shippingCost;                       // Cost of shipping
  final int total;                              // Total value of the order
  final int totalDozens;                        // Total quantity in dozens

  // Constructor for creating an OrderModel instance
  OrderModel({
    required this.id,
    required this.clientId,
    required this.creationDate,
    required this.deliveryDate,
    required this.deliveryStatus,
    required this.items,
    required this.paymentMethod,
    required this.shippingAddress,
    required this.shippingCost,
    required this.total,
    required this.totalDozens,
  });

  // Factory method to create an OrderModel from a Firestore document
  factory OrderModel.fromFirestore(DocumentSnapshot doc) {
    Map<String, dynamic> data = doc.data() as Map<String, dynamic>;

    // Parse the list of order items
    List<OrderItemModel> orderItems = [];
    if (data['items'] != null && data['items'] is List) {
      orderItems = (data['items'] as List)
          .map((itemData) =>
          OrderItemModel.fromMap(itemData as Map<String, dynamic>))
          .toList();
    }

    // Parse the shipping address
    ShippingAddressModel shippingAddr;
    if (data['shippingAddress'] != null && data['shippingAddress'] is Map<String, dynamic>) {

      shippingAddr = ShippingAddressModel.fromMap(
          data['shippingAddress'] as Map<String, dynamic>);

    }

    else {
      // Fallback address if not properly formatted
      shippingAddr = ShippingAddressModel(
          streetAddress: 'N/A',
          city: 'N/A'
      );
    }

    return OrderModel(
      id: doc.id,
      clientId: data['clientId'] ?? 'N/A',
      creationDate: data['creationDate'] as Timestamp? ?? Timestamp.now(),
      deliveryDate: data['deliveryDate'] as Timestamp,
      deliveryStatus: data['deliveryStatus'] ?? 'Unknown',
      items: orderItems,
      paymentMethod: data['paymentMethod'] ?? 'Pix',
      shippingAddress: shippingAddr,
      shippingCost: data['shippingCost'] ?? 0,
      total: data['total'] ?? 0,
      totalDozens: data['totalDozens'] ?? 0,
    );
  }

  // Converts the OrderModel to a Firestore-compatible map
  Map<String, dynamic> toFirestore() {
    return {
      'clientId': clientId,
      'creationDate': creationDate,
      'deliveryDate': deliveryDate,
      'deliveryStatus': deliveryStatus,
      'items': items.map((item) => item.toMap()).toList(),
      'paymentMethod': paymentMethod,
      'shippingAddress': shippingAddress.toMap(),
      'shippingCost': shippingCost,
      'total': total,
      'totalDozens': totalDozens,
    };
  }
}