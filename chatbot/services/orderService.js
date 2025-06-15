'use strict';

const { buildOrderConfirmationMessage } = require('../utils/messageUtils');
const { interpretFinalMethod } = require('../utils/paymentUtils')
const { getOrderConfiguration } = require('./configService');

const db = require('../firestore/firestore');



/**
 * Persists a new order doc into Firestore.
 */
async function createAndSaveOrder(orderDetails) {
  if (!orderDetails?.clientId || !orderDetails.total || !orderDetails.deliveryDate) {
    console.error('Invalid order details:', orderDetails);
    throw new Error('Invalid order data.');
  }
  const ref = await db.collection('orders').add(orderDetails);
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

    const formattedType = type.charAt(0).toUpperCase() + type.slice(1);

    return { type: formattedType, quantity: qty, itemValue };
  });

  // 3) calculate shipping
  const shippingCost = dozenCount < freeShipping ? shippingValue : 0;

  // 4) calculate total
  const total = subtotal + shippingCost;

  // 5) creating the order and setting to confirmation context
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

  agent.setContext({
    name: 'awaiting_order_confirmation',
    lifespan: 2,
    parameters: {
      orderToConfirm: JSON.stringify(newOrder)
    }
  });

  
  // 6) respond back to user
  const resp = buildOrderConfirmationMessage(newOrder);
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