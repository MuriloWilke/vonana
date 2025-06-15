'use strict';

// Importing required modules
const express = require('express')
const {WebhookClient} = require('dialogflow-fulfillment');

// Importing the intent handler functions from their respective files
const { handleMyOrders } = require('./handlers/myOrders');

const { handleCancelOrderRequest, 
  handleCancelOrderSelection 
} = require('./handlers/cancelOrders');

const { handleAddress } = require('./handlers/addressHandlers')

const { handleOrder,
  handleOrderConfirmation,
} = require('./handlers/orders')

const { handleCorrectedDozens, 
  handleCorrectedEggType, 
  handleCorrectedDeliveryDay, 
  handleCorrectedMethod, 
} = require('./handlers/orderCorrections')

const { handleEditAction,
  handleEditOrderChangeDate,
  handleEditOrderChangePaymentMethod,
  handleEditOrderChangeAddress,
  handleChooseItemToEdit,
  handleOrderItemAction,
  handleEditItemQuantity,
  handleEditItemType
} = require('./handlers/editingOrder')

// Enable Dialogflow debugging logs
process.env.DEBUG = 'dialogflow:debug';

// Initialize express app
const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Main webhook route that Dialogflow will send POST requests to
app.post('/', (req, res) => {
  // Create a new WebhookClient instance with the request and response
  const agent = new WebhookClient({ request: req, response: res });
  
  // Call the webhook entry function to handle the incoming request
  webhookEntry(agent);
});

// Main function that maps Dialogflow intents to specific handler functions
function webhookEntry(agent) {
  let intentMap = new Map();

  // Mapping order-related intents
  intentMap.set('Order Intent', handleOrder);
  
  intentMap.set('Capture Address Intent', handleAddress);
  
  intentMap.set('Capture Corrected Dozens Mixed Order Intent', handleCorrectedDozens);
  intentMap.set('Capture Corrected Egg Type Mixed Order Intent', handleCorrectedEggType);
  intentMap.set('Capture Corrected Preferred Delivery Day Order Intent', handleCorrectedDeliveryDay);
  intentMap.set('Capture Corrected Method Intent', handleCorrectedMethod);
  
  intentMap.set('Order Confirmation Intent', handleOrderConfirmation);

  intentMap.set('Order Edit Intent', handleEditAction);
  intentMap.set('Order Edit Intent - date', handleEditOrderChangeDate);
  intentMap.set('Order Edit Intent - method', handleEditOrderChangePaymentMethod);
  intentMap.set('Order Edit Intent - address', handleEditOrderChangeAddress);
  intentMap.set('Order Edit Intent - item', handleChooseItemToEdit);

  intentMap.set('Order Edit Item Intent', handleOrderItemAction);
  intentMap.set('Order Edit Item Intent - quantity', handleEditItemQuantity);
  intentMap.set('Order Edit Item Intent - type', handleEditItemType);

  // Mapping my orders intent
  intentMap.set('My Orders Intent', handleMyOrders);

  // Mapping cancel order intents
  intentMap.set('Cancel Order Request Intent', handleCancelOrderRequest);
  intentMap.set('Cancel Order Selection Intent', handleCancelOrderSelection);

  // Log which intent Dialogflow triggered
  console.log("Executing intent: ", agent.intent);

  // Let Dialogflow WebhookClient handle the request based on the intent map
  agent.handleRequest(intentMap);
}

// Exporting the express app
module.exports = app;