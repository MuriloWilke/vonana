'use strict';

const { formatCurrency } = require('../utils/currencyUtils');
const { getOrderConfiguration } = require('./configService');

const db = require('../firestore/firestore');

/**
 * Maps numeric payment codes to human‑readable method.
 */
function interpretFinalMethod(methodValue) {
  const paymentMethods = {
    1: 'Pix',
    2: 'Crédito',
    3: 'Débito',
    4: 'Dinheiro'
  };

  const method = paymentMethods[methodValue];
  if (!method) {
    console.warn('Unknown payment method:', methodValue);
    return 'Desconhecido';
  }

  return method;
}

/**
 * Persists a new order doc into Firestore.
 */
async function createAndSaveOrder(orderDetails) {
  if (!orderDetails?.clientId || !orderDetails.total || !orderDetails.deliveryDate) {
    console.error('Invalid order details:', orderDetails);
    throw new Error('Invalid order data.');
  }
  const ref = await db.collection('orders').add(orderDetails);
  console.log('Order saved with id:', ref.id);
  return ref;
}

/**
 * Drives the main “calculate + persist” flow for an order.
 */
async function processOrderFlow(agent, whatsappClientId, orderParams) {
  // 1) load pricing rules
  const config = await getOrderConfiguration(db);
  if (!config) {
    agent.add('Desculpe, problema ao obter configurações. Tente novamente mais tarde.');
    throw new Error('Failed to load configuration.');
  }
  const { extraValue, jumboValue, freeShipping, shippingValue } = config;

  // 2) calculate line items and subtotal
  let subtotal = 0, dozenCount = 0;

  const items = orderParams.dozensArray.map((qty, idx) => {
    const type = orderParams.eggTypeArray[idx];
    const unitPrice = type === 'extra' ? extraValue : jumboValue;
    const itemValue = unitPrice * qty;

    subtotal += itemValue;
    dozenCount += qty;

    return { type, quantity: qty, itemValue };
  });

  // 3) calculate shipping
  const shippingCost = dozenCount < freeShipping ? shippingValue : 0;

  // 4) calculate total
  const total = subtotal + shippingCost;

  // 5) persist order
  const newOrder = {
    clientId: whatsappClientId,
    creationDate: new Date(),
    deliveryDate: orderParams.deliveryDate,
    deliveryStatus: 'Pendente',
    items,
    totalDozens: dozenCount,
    paymentMethod: interpretFinalMethod(orderParams.method),
    shippingAddress: orderParams.shippingAddress,
    total,
    shippingCost
  };

  const docRef = await createAndSaveOrder(newOrder);

  // 6) respond back to user
  const formattedTotal = formatCurrency(total);
  const lines = items.map(i =>
    `- ${i.quantity} dúzias de ovos ${i.type} (${formatCurrency(i.itemValue)})`
  ).join('\n');

  let resp = `Perfeito! Anotei seu pedido:\n${lines}\nTotal geral: ${formattedTotal}\n`;
  
  if (shippingCost) resp += `Custo de entrega: ${formatCurrency(shippingCost)}\n`;
  
  // Format the address for the message
  const { shippingAddress } = orderParams;
  const addressParts = [
    shippingAddress['business-name'],
    shippingAddress['street-address'],
    [shippingAddress['city'], shippingAddress['admin-area']].filter(Boolean).join(' - '),
    shippingAddress['zip-code'] ? `CEP ${shippingAddress['zip-code']}` : null,
    shippingAddress['country']
  ].filter(Boolean);

  const formattedAddress = addressParts.join(', ');

  // Add the address to the message
  resp += `Para o endereço: ${formattedAddress}.\n`;
  resp += `O ID do seu pedido é ${docRef.id}.`;

  agent.add(resp);
}

/**
 * Continues the order flow after initial validation.
 * Checks if the client exists and has an address.
 * If no address is found, prompts user for it and sets the appropriate context.
 * Otherwise, proceeds with order processing.
 * 
 * @param {object} agent - Dialogflow agent object
 * @param {string} whatsappClientId - Unique client identifier
 * @param {object} validatedOrderParams - Validated order parameters
 */
async function continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams) {
  try {
    const { dozensArray, method, eggTypeArray, deliveryDate } = validatedOrderParams;

    // Collecting the client if it exists, if not preparing to create one
    const clientDocRef = db.collection('clients').doc(whatsappClientId);
    const clientDocSnapshot = await clientDocRef.get();
    const clientData = clientDocSnapshot.exists ? clientDocSnapshot.data() : null;
    const savedAddress = clientData ? clientData.shippingAddress : null;

    if (!savedAddress) {
      console.log(`Address missing for client ${whatsappClientId}. Asking for address.`);

      // Set unified address context with original params
      agent.setContext({
        name: 'awaiting_address_for_order',
        lifespan: 2,
        parameters: {
          whatsappClientId,
          originalOrderDozensArray: dozensArray,
          originalOrderMethod: method,
          originalOrderEggTypeArray: eggTypeArray,
          originalOrderDeliveryDate: deliveryDate,
        }
      });

      agent.add("Por favor, me informe seu endereço para entrega do pedido.");
      return;
    }

    // Address exists, proceed with order
    const orderParams = {
      dozensArray,
      method,
      eggTypeArray,
      shippingAddress: savedAddress,
      deliveryDate,
    };

    // Calling the order processing flow
    await processOrderFlow(agent, whatsappClientId, orderParams);
    console.log("processOrderFlow completed from continueOrderAfterValidation (using saved address).");

  } catch (error) {
    console.error("An error occurred during initial order handler flow:", error);
    agent.add(`Desculpe, tive um problema interno. Por favor, tente novamente mais tarde.`);
    throw error;
  }
}

module.exports = {
  interpretFinalMethod,
  createAndSaveOrder,
  processOrderFlow,
  continueOrderAfterValidation
};