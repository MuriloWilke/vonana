import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/order_model.dart';
import '../models/shipping_address_model.dart';
import '../utils/map_utils.dart';

class OrderCard extends StatelessWidget {
  final OrderModel order;

  final VoidCallback? onOrderConcluded;

  const OrderCard({
    super.key,
    required this.order,
    this.onOrderConcluded,
  });

  /// Formats the shipping address into a readable string by joining available fields.
  String _getFormattedShippingAddress(ShippingAddressModel address) {
    List<String> parts = [];
    if (address.businessName != null && address.businessName!.isNotEmpty) {
      parts.add(address.businessName!);
    }
    if (address.streetAddress != null && address.streetAddress!.isNotEmpty) {
      parts.add(address.streetAddress!);
    }
    if (address.city != null && address.city!.isNotEmpty) {
      parts.add(address.city!);
    }
    if (address.adminArea != null && address.adminArea!.isNotEmpty) {
      parts.add(address.adminArea!);
    }
    if (address.zipCode != null && address.zipCode!.isNotEmpty) {
      parts.add(address.zipCode!);
    }
    if (parts.isEmpty) {
      return 'Endereço não disponível';
    }
    return parts.join(', ');
  }


  @override
  Widget build(BuildContext context) {
    // Format the order creation date
    String formattedCreationDate = DateFormat('dd/MM/yyyy').format(order.creationDate.toDate());

    // Get the formatted shipping address string
    String displayShippingAddress = _getFormattedShippingAddress(order.shippingAddress);

    return Card(
      elevation: 4,
      margin: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 16.0),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // Row showing shortened order and client IDs
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Flexible(
                  child: Text(
                    'Id do Pedido: ${order.id.length > 6 ? order.id.substring(0, 6) : order.id}...',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).primaryColor),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Flexible(
                  child: Text(
                    'Id do Cliente: ${order.clientId.length > 8 ? order.clientId.substring(0, 8) + '...' : order.clientId}',
                    style: TextStyle(fontSize: 14, color: Colors.grey[700]),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),

            const Divider(height: 20, thickness: 2),

            // Display order creation date
            _buildInfoRow(
                icon: Icons.calendar_today,
                label: 'Data da Criação:',
                value: formattedCreationDate),
            const SizedBox(height: 8),

            // Display total dozens ordered
            _buildInfoRow(
                icon: Icons.format_list_numbered,
                label: 'Total de Dúzias:',
                value: order.totalDozens.toString()),
            const SizedBox(height: 8),

            // Display each item with its type and quantity in dozens
            ...order.items.map((item) => Padding(
              padding: const EdgeInsets.only(bottom: 4.0),
              child: _buildInfoRow(
                icon: Icons.egg_outlined,
                label: 'Item (${item.type}):',
                value: '${item.quantity} dúzia(s)',
              ),
            )).toList(),
            if (order.items.isNotEmpty) const SizedBox(height: 8),

            // Display payment method
            _buildInfoRow(
                icon: Icons.payment,
                label: 'Método de Pagamento:',
                value: order.paymentMethod),
            const SizedBox(height: 8),

            // Display shipping address, allowing multiline if needed
            _buildInfoRow(
                icon: Icons.location_on_outlined,
                label: 'Endereço de Entrega:',
                value: displayShippingAddress,
                isMultiline: true),
            const SizedBox(height: 8),

            // Display total amount formatted as Brazilian currency (R$)
            _buildInfoRow(
                icon: Icons.monetization_on_outlined,
                label: 'Total:',
                value: NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$')
                    .format(order.total / 100),
                valueStyle: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.green)),
            const SizedBox(height: 12),

            // Row displaying delivery status with colored chip
            Row(
              children: [
                Icon(Icons.local_shipping_outlined, color: Colors.grey[700], size: 18),
                const SizedBox(width: 8),
                Text(
                  'Status da Entrega:',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: Colors.grey[800]),
                ),
                const Spacer(),
                Chip(
                  label: Text(
                    order.deliveryStatus,
                    style: const TextStyle(color: Colors.white, fontSize: 12),
                  ),
                  backgroundColor: _getStatusColor(order.deliveryStatus),
                  padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Show buttons only if deliveryStatus is "pendente"
            if (order.deliveryStatus.toLowerCase() == 'pendente') ...[
              // Button to open map directions for delivery address
              Center(
                child: SizedBox(
                  width: 220,
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.directions_car_filled_outlined),
                    label: const Text('Gerar Rota Individual'),
                    onPressed: () {
                      MapUtils.launchMapsUrl(context, displayShippingAddress);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Theme.of(context).colorScheme.primary,
                      foregroundColor: Theme.of(context).colorScheme.onPrimary,
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8.0),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),

              // Button to change the satus to "concluído" in firestore
              Center(
                child: SizedBox(
                  width: 220,
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.check_circle_outline),
                    label: const Text('Concluir'),

                    // Try to update the status in firestore
                    onPressed: () async {
                      try {
                        await FirebaseFirestore.instance
                            .collection('orders')
                            .doc(order.id)
                            .update({'deliveryStatus': 'Concluído'});

                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text(
                                'Entrega marcada como concluída.')),
                          );
                        }

                        onOrderConcluded?.call();

                      } catch (e) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Erro ao concluir: $e')),
                        );
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green.shade700,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8.0),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Helper method to build a row with an icon, label, and value.
  /// Supports multiline text and custom value text style.
  Widget _buildInfoRow({
    required IconData icon,
    required String label,
    required String value,
    TextStyle? valueStyle,
    bool isMultiline = false,
  }) {
    return Row(
      crossAxisAlignment:
      isMultiline ? CrossAxisAlignment.start : CrossAxisAlignment.center,
      children: [
        Icon(icon, color: Colors.grey[700], size: 18),
        const SizedBox(width: 8),
        Text(
          '$label ',
          style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w500,
              color: Colors.grey[800]),
        ),
        Expanded(
          child: Text(
            value,
            style: valueStyle ??
                TextStyle(fontSize: 15, color: Colors.grey[900]),
            textAlign: TextAlign.right,
            softWrap: isMultiline,
            overflow: isMultiline ? TextOverflow.visible : TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  /// Returns a color based on the delivery status string.
  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pendente':
        return Colors.orange.shade700;
      case 'concluído':
        return Colors.green.shade600;
      case 'cancelado':
        return Colors.red.shade700;
      default:
        return Colors.grey.shade500;
    }
  }
}