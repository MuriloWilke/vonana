/// Model representing a shipping address
class ShippingAddressModel {
  final String? adminArea;
  final String? businessName;
  final String? city;
  final String? country;
  final String? island;
  final String? shortcut;
  final String? streetAddress;
  final String? subadminArea;
  final String? zipCode;

  // Constructor for creating a ShippingAddressModel instance
  ShippingAddressModel({
    this.adminArea,
    this.businessName,
    this.city,
    this.country,
    this.island,
    this.shortcut,
    this.streetAddress,
    this.subadminArea,
    this.zipCode,
  });

  // Factory method to create an instance from a map
  factory ShippingAddressModel.fromMap(Map<String, dynamic> map) {
    return ShippingAddressModel(
      adminArea: map['admin-area'],
      businessName: map['business-name'],
      city: map['city'],
      country: map['country'],
      island: map['island'],
      shortcut: map['shortcut'],
      streetAddress: map['street-address'],
      subadminArea: map['subadmin-area'],
      zipCode: map['zip-code'],
    );
  }

  // Converts the object into a map
  Map<String, dynamic> toMap() {
    return {
      'admin-area': adminArea,
      'business-name': businessName,
      'city': city,
      'country': country,
      'island': island,
      'shortcut': shortcut,
      'street-address': streetAddress,
      'subadmin-area': subadminArea,
      'zip-code': zipCode,
    };
  }

  // A readable string representation of the address (e.g., for displaying in UI)
  @override
  String toString() {
    List<String> parts = [];
    if (businessName != null && businessName!.isNotEmpty) parts.add(businessName!);
    if (streetAddress != null && streetAddress!.isNotEmpty) parts.add(streetAddress!);
    if (city != null && city!.isNotEmpty) parts.add(city!);
    return parts.join(', ');
  }
}