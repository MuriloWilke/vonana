// Import the Firestore instance
const db = require('../firestore/firestore');

// Import shared formatting utilities for dates and currency
const { formatOrderDate } = require('../utils/dateUtils');
const { formatCurrency } = require('../utils/currencyUtils');


/**
 * Dialogflow handler for the "My Orders Intent".
 * Fetches all pending orders for the user and builds a response message.
 *
 * @param {WebhookClient} agent  Dialogflow fulfillment agent
 */
async function handleMyOrders(agent) {
  console.log('--- Executing handleMyOrders ---');
  try {
    // Retrieve the WhatsApp client ID from agent parameters.
    // Fallback to a hard‑coded test ID until real parameter is wired.
    const whatsappClientId = agent.parameters.whatsappClientId
      || 'whatsapp:+15551234568';

    // If we still don’t have a client ID, abort and notify the user.
    if (!whatsappClientId) {
      console.error('No client ID for handleMyOrders.');
      agent.add('Desculpe, não consegui identificar seu usuário para buscar seus pedidos.');
      return;
    }

    // Query Firestore "orders" collection for this client’s pending orders,
    // sorted by creation date ascending.
    const pendingOrders = await db
      .collection('orders')
      .where('clientId', '==', whatsappClientId)
      .where('deliveryStatus', '==', 'Pendente')
      .orderBy('creationDate', 'asc')
      .get();

    // If no orders found, let the user know
    if (pendingOrders.empty) {
      agent.add('Você não tem nenhum pedido pendente no momento!');
      return;
    }

    // Begin building the multi‑line response message
    let msg = 'Aqui estão seus pedidos pendentes:\n\n';

    // Iterate through each order document
    pendingOrders.forEach(doc => {
      const order = doc.data();

      // Append order ID
      msg += `*Pedido ID:* ${doc.id}\n`;

      // Format and append the order’s creation date
      msg += `*Data:* ${formatOrderDate(order.creationDate)}\n`;

      // Format and append the requested delivery date
      msg += `*Data para Entrega:* ${formatOrderDate(order.deliveryDate)}\n`;

      // Append current delivery status
      msg += `*Status:* ${order.deliveryStatus}\n`;

      // List each item in the order, or fallback text if structure invalid
      msg += `*Itens:*\n` +
        (Array.isArray(order.items)
          ? order.items
              .map(i => `- ${i.quantity} dúzia(s) de ovos ${i.type}`)
              .join('\n')
          : '- Informações de itens indisponíveis'
        ) + '\n';

      // If a total amount is provided, format and append it
      if (order.total != null) {
        msg += `*Total:* ${formatCurrency(order.total)}\n`;
      }

      // If shipping cost is greater than zero, format and append it
      if (order.shippingCost > 0) {
        msg += `*Custo de Entrega:* ${formatCurrency(order.shippingCost)}\n`;
      }

      // Separate each order block with a divider
      msg += `\n---\n\n`;
    });

    // Send the assembled message back to the user
    agent.add(msg);
    console.log('Finished handling handleMyOrders successfully.');

  } catch (err) {
    // Log unexpected errors and notify the user of an internal failure
    console.error('Error in handleMyOrders:', err);
    agent.add('Desculpe, tive um problema interno ao buscar seus pedidos. Por favor, tente novamente mais tarde.');
    throw err;  // rethrow so that upstream logging can catch it if needed
  }
}

// Export the handler
module.exports = { handleMyOrders };