'use strict';

// Firestore DB instance
const db = require('../firestore/firestore');
// Shared format utilities
const { formatOrderDate } = require('../utils/dateUtils');
const { formatCurrency } = require('../utils/currencyUtils');

/**
 * Handler for the "Cancel Order Request Intent".
 * Lists the client's pending orders and sets a context
 * so Dialogflow can capture which one to cancel next.
 *
 * @param {WebhookClient} agent  Dialogflow fulfillment agent
 */
async function handleCancelOrderRequest(agent) {
  console.log('Executing handleCancelOrderRequest');
  const contextName = 'awaiting_cancel_order_selection';

  try {
    // TODO: replace the hard‑coded ID with agent.parameters.whatsappClientId
    const whatsappClientId = 'whatsapp:+15551234568';
    if (!whatsappClientId) {
      console.error('WhatsApp Client ID not received for handleCancelOrderRequest.');
      agent.add('Desculpe, não consegui identificar seu usuário para buscar seus pedidos.');
      return;
    }

    console.log(`Retrieving pending orders for client: ${whatsappClientId}`);

    // Query Firestore for this client’s pending orders
    const pendingSnapshot = await db
      .collection('orders')
      .where('clientId', '==', whatsappClientId)
      .where('deliveryStatus', '==', 'Pendente')
      .orderBy('creationDate', 'asc')
      .get();

    // If none, inform and clear any context
    if (pendingSnapshot.empty) {
      console.log(`No pending orders found for ${whatsappClientId}`);
      agent.add('Você não tem nenhum pedido pendente que possa ser cancelado no momento.');
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    // Build numbered list and collect IDs
    const pendingIds = [];

    const messageParts = ['Aqui estão seus pedidos pendentes. Qual deles você gostaria de cancelar? Por favor, diga o *número*:\n'];

    pendingSnapshot.docs.forEach((doc, idx) => {
      const order = doc.data();
      pendingIds.push(doc.id);

      const orderLines = [
        `*${idx + 1}.* Pedido ID: ${doc.id}`,
        order.creationDate ? `   Data: ${formatOrderDate(order.creationDate)}` : null,
        Array.isArray(order.items) && order.items.length
          ? `   Itens: ${order.items.map(i => `${i.quantity} ${i.type}`).join(', ')}`
          : null,
        order.total != null ? `   Total: ${formatCurrency(order.total)}` : null
      ].filter(Boolean);

      messageParts.push(orderLines.join('\n'));
    });

    // Store needed info in context to pick up on next intent
    agent.setContext({
      name: contextName,
      lifespan: 2,
      parameters: {
        whatsappClientId,
        pendingOrderIdsList: pendingIds
      }
    });

    // Send list to user
    agent.add(messageParts.join('\n\n'));
    console.log(`Context '${contextName}' set with ${pendingIds.length} IDs`);

  } catch (err) {
    console.error('Error in handleCancelOrderRequest:', err);
    agent.add('Desculpe, tive um problema interno ao buscar seus pedidos. Por favor, tente novamente mais tarde.');
    // Clear context on any failure
    agent.setContext({ name: contextName, lifespan: 0 });
    throw err;
  }
}

/**
 * Handler for the "Cancel Order Selection Intent".
 * Reads back the stored context, validates the user's numeric choice,
 * and updates the chosen order’s status in Firestore.
 *
 * @param {WebhookClient} agent  Dialogflow fulfillment agent
 */
async function handleCancelOrderSelection(agent) {
  console.log('Executing handleCancelOrderSelection');
  const contextName = 'awaiting_cancel_order_selection';

  try {
    // Get the user’s spoken number
    const selectedNumber = agent.parameters.selectedOrderNumber;

    // Validate it’s a positive integer
    if (!Number.isInteger(selectedNumber) || selectedNumber <= 0) {
      console.warn(`Invalid selection: ${selectedNumber}`);
      agent.add('Por favor, diga apenas o *número* do pedido que você deseja cancelar.');
      // Re‑set the same context so we keep awaiting
      const orig = agent.getContext(contextName);
      if (orig) {
        agent.setContext({ name: contextName, lifespan: 2, parameters: orig.parameters });
      }
      return;
    }
    console.log(`User selected order number: ${selectedNumber}`);

    // Retrieve stored context and its parameters
    const origCtx = agent.getContext(contextName);
    if (!origCtx?.parameters) {
      console.error('Context missing during selection');
      agent.add('Desculpe, perdi as informações dos pedidos. Podemos tentar de novo?');
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    const { whatsappClientId, pendingOrderIdsList } = origCtx.parameters;

    if (!whatsappClientId || !Array.isArray(pendingOrderIdsList) || pendingOrderIdsList.length === 0) {
      console.error('Invalid context state.');
      agent.add('Desculpe, perdi as informações dos pedidos. Podemos tentar de novo?');
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    // Ensure ID list is valid
    if (!Array.isArray(pendingOrderIdsList) || pendingOrderIdsList.length === 0) {
      console.error('No pendingOrderIdsList in context');
      agent.add('Desculpe, não consegui recuperar seus pedidos. Tente novamente.');
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    // Convert to zero‑based index and validate range
    const idx = selectedNumber - 1;
    if (idx < 0 || idx >= pendingOrderIdsList.length) {
      console.warn(`Selection out of range: ${selectedNumber}`);
      agent.add(`Por favor, escolha um número entre 1 e ${pendingOrderIdsList.length}.`);
      agent.setContext({ name: contextName, lifespan: 2, parameters: origCtx.parameters });
      return;
    }

    // Perform the cancellation in Firestore
    const orderId = pendingOrderIdsList[idx];
    const orderRef = db.collection('orders').doc(orderId);
    const snapshot = await orderRef.get();

    // Verify it’s still pending
    if (!snapshot.exists || snapshot.data().deliveryStatus !== 'Pendente') {
      agent.add('Este pedido não está mais pendente e não pode ser cancelado.');
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    await orderRef.update({ deliveryStatus: 'Cancelado' });
    console.log(`Order ${orderId} canceled successfully`);

    // Confirm to user and clear context
    agent.add(`Ok! Seu pedido com ID ${orderId} foi cancelado.`);
    agent.setContext({ name: contextName, lifespan: 0 });

  } catch (err) {
    console.error('Error in handleCancelOrderSelection:', err);
    agent.add('Desculpe, tivemos um problema interno ao processar seu cancelamento. Por favor, tente novamente mais tarde.');
    agent.setContext({ name: contextName, lifespan: 0 });
    throw err;
  }
}

// Export both handlers
module.exports = {
  handleCancelOrderRequest,
  handleCancelOrderSelection
};