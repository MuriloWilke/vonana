import 'package:cloud_firestore/cloud_firestore.dart';

// A model class representing a client with a WhatsApp ID and shipping address.
class Client {
  final String whatsappId; // Unique identifier (e.g., phone number or user ID from WhatsApp)
  final String shippingAddress; // Client's delivery address

  // Constructor for creating a Client instance
  Client({
    required this.whatsappId,
    required this.shippingAddress,
  });

  // Factory method for creating a Client instance from a Firestore document
  factory Client.fromFirestore(DocumentSnapshot doc) {

    // Extracts the data map from the document snapshot
    Map<String, dynamic> data = doc.data() as Map<String, dynamic>;

    return Client(
      // The document ID is used as the WhatsApp ID
      whatsappId: doc.id,
      // Retrieves the shipping address from the document's data
      // If not found, defaults to 'N/A'
      shippingAddress: data['shippingAddress'] ?? 'N/A',
    );
  }
}