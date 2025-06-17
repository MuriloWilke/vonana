/// Model representing a single item within an order
class OrderItemModel {
  final int itemValue; // Price or value of the item
  final int quantity; // Quantity ordered
  final String type; // Type or description of the item

  // Constructor for creating an OrderItemModel instance
  OrderItemModel({
    required this.itemValue,
    required this.quantity,
    required this.type,
  });

  // Factory method for creating an instance from a map (e.g., Firestore document)
  factory OrderItemModel.fromMap(Map<String, dynamic> map) {
    return OrderItemModel(
      itemValue: map['itemValue'] ?? 0,
      quantity: map['quantity'] ?? 0,
      type: map['type'] ?? 'N/A',
    );
  }

  // Converts the object into a map to be stored in Firestore
  Map<String, dynamic> toMap() {
    return {
      'itemValue': itemValue,
      'quantity': quantity,
      'type': type,
    };
  }
}