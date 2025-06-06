'use strict';

const functions = require('firebase-functions'); 
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');

const admin = require('firebase-admin'); 
admin.initializeApp({ 
  credential: admin.credential.applicationDefault(), 
}); 
const db = admin.firestore();

process.env.DEBUG = 'dialogflow:debug';

// Helper function to format date
function formatOrderDate(timestamp) {
  if (!timestamp || !timestamp.toDate) {
    console.warn("Invalid timestamp provided for formatting:", timestamp);
    return "Data desconhecida";
  }
  try {
    const date = timestamp.toDate();
    // Format as dd/mm/yyyy H:MM
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZoneName: 'short'
    };
    return date.toLocaleString('pt-BR', options);
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Erro na data";
  }
}

// Helper function to format currency
function formatCurrency(value) {
  const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
  return formatter.format(value / 100);
}

async function handleCancelOrderRequest(agent) {
  console.log("Executing handleCancelOrderRequest");
  const contextName = 'awaiting_cancel_order_selection';

  try {
    // Get the client ID
    // const whatsappClientId = agent.parameters.whatsappClientId;

    // Test purposes only
    const whatsappClientId = 'whatsapp:+15551234568';

    if (!whatsappClientId) {
      console.error("WhatsApp Client ID not received for handleCancelOrderRequest.");
      agent.add("Desculpe, não consegui identificar seu usuário para buscar seus pedidos.");
      return;
    }
    console.log(`Attempting to retrieve pending orders for cancellation for client: ${whatsappClientId}`);

    // Query Firestore for pending orders for this client
    const ordersRef = db.collection('orders');
    const pendingOrdersQuery = ordersRef
      .where('clientId', '==', whatsappClientId)
      .where('deliveryStatus', '==', 'Pendente')
      .orderBy('creationDate', 'asc');

    const querySnapshot = await pendingOrdersQuery.get();

    if (querySnapshot.empty) {
      console.log(`No pending orders found for cancellation for client: ${whatsappClientId}`);
      agent.add("Você não tem nenhum pedido pendente que possa ser cancelado no momento.");
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    console.log(`Found ${querySnapshot.size} pending orders for cancellation for client: ${whatsappClientId}`);

    let responseMessage = "Aqui estão seus pedidos pendentes. Qual deles você gostaria de cancelar? Por favor, diga o *número*.\n\n";
    const pendingOrderIds = [];

    // Build the message and collect order IDs
    querySnapshot.docs.forEach((doc, index) => {
      const order = doc.data();
      pendingOrderIds.push(doc.id);

      responseMessage += `*${index + 1}.* Pedido ID: ${doc.id}\n`;
      if (order.creationDate) {
        responseMessage += `   Data: ${formatOrderDate(order.creationDate)}\n`;
      }
      if (order.items && Array.isArray(order.items) && order.items.length > 0) {
        responseMessage += `   Itens: ${order.items.map(item => `${item.quantity} ${item.type}`).join(', ')}\n`;
      }
       if (order.total !== undefined) {
        responseMessage += `   Total: ${formatCurrency(order.total)}\n`;
       }
      responseMessage += `\n`;
    });

    // Set context to await the user's selection, storing the list of IDs
    agent.setContext({
      name: contextName,
      lifespan: 2,
      parameters: {
        whatsappClientId: whatsappClientId,
        pendingOrderIdsList: pendingOrderIds,
      }
    });

    // Send the message listing orders and asking for selection
    agent.add(responseMessage);

    console.log(`Pending order list sent, awaiting selection via context '${contextName}'.`);

  } catch (error) {
    console.error("An error occurred during handleCancelOrderRequest:", error);
    agent.add("Desculpe, tive um problema interno ao buscar seus pedidos. Por favor, tente novamente mais tarde.");
    // Clear context on error as a safety measure
    agent.setContext({ name: contextName, lifespan: 0 });
    throw error;
  }
}

async function handleCancelOrderSelection(agent) {
  console.log("Executing handleCancelOrderSelection");
  const contextName = 'awaiting_cancel_order_selection';

  try {
    const selectedNumber = agent.parameters.selectedOrderNumber;

    // Validate that a number parameter was captured
    if (typeof selectedNumber !== 'number' || selectedNumber <= 0 || !Number.isInteger(selectedNumber)) {
      console.warn(`Invalid or non-positive integer selected for cancellation: ${selectedNumber}`);
      // Keep the context and prompt again for a valid number
      agent.add("Por favor, diga apenas o *número* do pedido que você deseja cancelar na lista acima.");
        
      const originalContext = agent.getContext(contextName);
      if (originalContext) {
        agent.setContext({
          name: contextName,
          lifespan: 2,
          parameters: originalContext.parameters
        });
      } else {
        // Fallback if context was somehow lost
        console.error("Context 'awaiting_cancel_order_selection' lost during handleCancelOrderSelection.");
        agent.add("Desculpe, perdi as informações dos pedidos. Podemos tentar de novo? Diga 'Quero cancelar um pedido'.");
        agent.setContext({ name: contextName, lifespan: 0 });
      }
      return;
    }
    console.log(`Received selected order number: ${selectedNumber}`);


    // Retrieve the necessary data from the context
    const originalContext = agent.getContext(contextName);

    // Validate that the context exists and has parameters
    if (!originalContext || !originalContext.parameters) {
      console.error("Context 'awaiting_cancel_order_selection' not found or missing parameters.");
      agent.add("Desculpe, perdi as informações dos pedidos. Podemos tentar de novo? Diga 'Quero cancelar um pedido'.");
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;
    const pendingOrderIdsList = originalParams.pendingOrderIdsList;

    // Validate retrieved parameters
    if (!whatsappClientId || !Array.isArray(pendingOrderIdsList) || pendingOrderIdsList.length === 0) {
      console.error("Missing client ID or pending order IDs list from context.");
      agent.add("Desculpe, perdi as informações dos pedidos. Podemos tentar de novo? Diga 'Quero cancelar um pedido'.");
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    console.log(`Retrieved ${pendingOrderIdsList.length} pending order IDs from context for client ${whatsappClientId}.`);

    // Calculate the index based on the user's 1-based selection
    const selectedIndex = selectedNumber - 1;

    // Validate the selected index against the size of the list
    if (selectedIndex < 0 || selectedIndex >= pendingOrderIdsList.length) {
      console.warn(`Selected number ${selectedNumber} is out of valid range (1-${pendingOrderIdsList.length}).`);
      agent.add(`Por favor, escolha um número entre 1 e ${pendingOrderIdsList.length} para o pedido que você deseja cancelar.`);
      
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: originalParams
      });
      return;
    }

    // Get the actual order ID from the array
    const orderIdToCancel = pendingOrderIdsList[selectedIndex];
    console.log(`Selected order ID for cancellation: ${orderIdToCancel}`);

    // Perform the Firestore update
    const orderDocRef = db.collection('orders').doc(orderIdToCancel);

    const docSnapshot = await orderDocRef.get();
    if (!docSnapshot.exists || docSnapshot.data().deliveryStatus !== 'Pendente') {
      agent.add("Este pedido não está mais pendente e não pode ser cancelado.");
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    await orderDocRef.update({
      deliveryStatus: 'Cancelado'
    });
    console.log(`Order ${orderIdToCancel} status updated to 'Cancelado'.`);

    // Send confirmation message
    agent.add(`Ok! Seu pedido com ID ${orderIdToCancel} foi cancelado.`);

    // Clear the context since the cancellation is complete
    agent.setContext({ name: contextName, lifespan: 0 });
    console.log(`Context '${contextName}' cleared.`);


  } catch (error) {
    console.error("An error occurred during handleCancelOrderSelection:", error);
    agent.add("Desculpe, tivemos um problema interno ao processar seu cancelamento. Por favor, tente novamente mais tarde.");
    // Clear context on error as a safety measure
    agent.setContext({ name: contextName, lifespan: 0 });
    throw error;
  }
}

async function handleMyOrders(agent) {
  console.log("--- Executing handleMyOrders ---");
  try {
    
    // Getting the client id
    // const whatsappClientId = agent.parameters.whatsappClientId;

    // Test purposes only
    const whatsappClientId = 'whatsapp:+15551234568'; 

    if (!whatsappClientId) {
      console.error("WhatsApp Client ID not received for handleMyOrders.");
      agent.add("Desculpe, não consegui identificar seu usuário para buscar seus pedidos.");
      return;
    }
    console.log(`Attempting to retrieve pending orders for client: ${whatsappClientId}`);

    // Query Firestore for pending orders for this client
    const ordersRef = db.collection('orders');
    const pendingOrdersQuery = ordersRef
      .where('clientId', '==', whatsappClientId)
      .where('deliveryStatus', '==', 'Pendente')
      .orderBy('creationDate', 'asc');

    const querySnapshot = await pendingOrdersQuery.get();

    if (querySnapshot.empty) {
      console.log(`No pending orders found for client: ${whatsappClientId}`);
      agent.add("Você não tem nenhum pedido pendente no momento!");
      return;
    }

    console.log(`Found ${querySnapshot.size} pending orders for client: ${whatsappClientId}`);

    let responseMessage = "Aqui estão seus pedidos pendentes:\n\n";

    // Build the message for each order
    querySnapshot.forEach(doc => {
      const order = doc.data();
      responseMessage += `*Pedido ID:* ${doc.id}\n`;
      if (order.creationDate) {
        responseMessage += `*Data:* ${formatOrderDate(order.creationDate)}\n`;
      }
      responseMessage += `*Status:* ${order.deliveryStatus}\n`;
      responseMessage += `*Itens:*\n`;

      // List items in the order
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          // Ensure item structure is as expected
          if (item.quantity && item.type) {
            responseMessage += `- ${item.quantity} dúzia(s) de ovos ${item.type}\n`;
          }
        });
      } else {
        responseMessage += `- Informações de itens indisponíveis\n`;
      }


      // Display total and shipping cost (if applicable)
      if (order.total !== undefined) {
        responseMessage += `*Total:* ${formatCurrency(order.total)}\n`;
      }
       if (order.shippingCost && order.shippingCost > 0) {
          responseMessage += `*Custo de Entrega:* ${formatCurrency(order.shippingCost)}\n`;
       }

      responseMessage += `\n---\n\n`;
    });

    // Add the final message to the agent
    agent.add(responseMessage);

    console.log("Finished handling handleMyOrders successfully.");

  } catch (error) {
    console.error("An error occurred during handleMyOrders:", error);
    // Send a user-friendly error message
    agent.add("Desculpe, tive um problema interno ao buscar seus pedidos. Por favor, tente novamente mais tarde.");
    throw error;
  }
}

async function getOrderConfiguration(db) {
  const configDocRef = db.collection('configurations').doc('1');
  const docSnapshot = await configDocRef.get();

  if (!docSnapshot.exists) {
    console.error("Configuration document with id '1' not found.");
    return null;
  }

  const data = docSnapshot.data();
  const jumboValue = data.jumboValue;
  const extraValue = data.extraValue;
  const freeShipping = data.freeShipping;
  const shippingValue = data.shippingValue;

  if (extraValue === undefined || freeShipping === undefined || shippingValue === undefined || jumboValue === undefined) {
    console.error("Missing essential configuration fields in document 1:", data);
    return null;
  }

  return { extraValue, jumboValue, freeShipping, shippingValue };
}

async function createAndSaveOrder(db, orderDetails) {

  // Basic validation
  if (!orderDetails || !orderDetails.clientId || !orderDetails.total || !orderDetails.shippingAddress) {
    console.error("Invalid order details provided for saving:", orderDetails);
    throw new Error("Invalid order data.");
  }

  const docRef = await db.collection('orders').add(orderDetails);
  console.log('Order saved with the id:', docRef.id);
  return docRef;
}

function interpretFinalMethod(methodValue) {
    switch (methodValue) {
        case 1:
            return "Pix";
        case 2:
            return "Crédito";
        case 3:
            return "Débito";
        case 4:
          return "Dinheiro"
        default:
            console.warn("Unknown payment method value:", methodValue);
            return "Desconhecido";
    }
}

async function processOrderFlow(agent, whatsappClientId, orderParams) {
  const { dozensArray, method, shippingAddress: finalShippingAddressForOrder, eggTypeArray } = orderParams;

  // Read configurations
  const config = await getOrderConfiguration(db);
  if (!config) {
    agent.add(`Desculpe, tivemos um problema técnico ao obter as configurações. Por favor, tente novamente mais tarde.`);
    throw new Error("Failed to load configuration.");
  }
  const { extraValue, jumboValue, freeShipping, shippingValue } = config;
  console.log("Config loaded:", config);

  // Calculate final value
  let totalOrderValue = 0;
  let totalDozensCount = 0;
  const orderItems = [];

  for (let i = 0; i < dozensArray.length; i++) {
    const dozenCount = dozensArray[i];
    const eggType = eggTypeArray[i];

    let itemValue;
    if (eggType === 'extra') {
      itemValue = extraValue * dozenCount;
    } else if (eggType === 'jumbo') {
      itemValue = jumboValue * dozenCount;
    } else {
      console.error(`Unexpected egg type during calculation: ${eggType}`);
      continue;
    }

    totalOrderValue += itemValue;
    totalDozensCount += dozenCount;

    // Add item detail for saving
    orderItems.push({
      type: eggType,
      quantity: dozenCount,
      itemValue: itemValue
    });
  }

  // Add shipping cost if applicable
  let finalValue = totalOrderValue;
  let shippingIncluded = false;
  if (totalDozensCount < freeShipping) {
    finalValue += shippingValue;
    shippingIncluded = true;
  }
  console.log(`Total order value calculated: ${totalOrderValue}. Final value (with shipping): ${finalValue}. Total dozens: ${totalDozensCount} (Shipping included: ${shippingIncluded})`);

  // Formatted value
  const finalValueFormatted = formatCurrency(finalValue);

  // Formatted method
  const finalMethod = interpretFinalMethod(method);

  // Create and save order
  const newOrderDetails = {
    clientId: whatsappClientId,
    creationDate: new Date(),
    deliveryDate: null,
    deliveryStatus: 'Pendente',
    items: orderItems,
    totalDozens: totalDozensCount,
    paymentMethod: finalMethod,
    shippingAddress: finalShippingAddressForOrder,
    total: finalValue,
    shippingCost: shippingIncluded ? shippingValue : 0
  };

  const docRef = await createAndSaveOrder(db, newOrderDetails);
  console.log('Order saved successfully.');

  // Response
  let responseMessage = "Perfeito! Anotei seu pedido:\n";
  orderItems.forEach(item => {
    const itemValueFormatted = formatCurrency(item.itemValue);
    responseMessage += `- ${item.quantity} dúzias de ovos ${item.type} (${itemValueFormatted})\n`;
  });

  if (shippingIncluded) {
    responseMessage += `Custo de entrega: ${formatCurrency(shippingValue)}\n`;
  }

  responseMessage += `Total geral: ${finalValueFormatted}\n`;
  responseMessage += `Para o endereço ${finalShippingAddressForOrder}.\n`;

  agent.add(responseMessage);
  agent.add(`O ID do seu pedido é ${docRef.id}. Se precisar de alguma ajuda, mande uma mensagem!`);

}

async function ensureClientExistsAndAddressSaved(db, whatsappClientId, providedAddress) {

  if (!providedAddress) {
    console.error(`Invalid address provided for client ${whatsappClientId}:`, providedAddress);
    throw new Error("Valid address required to ensure client profile.");
  }

  // Managing the client
  const clientDocRef = db.collection('clients').doc(whatsappClientId);
  const clientDocSnapshot = await clientDocRef.get();

  if (!clientDocSnapshot.exists) {
    // Case 1: Client doesnt exist and doesnt gave an address
    console.log(`Client ${whatsappClientId} not found.`);
    if (!providedAddress) {
      console.error(`Cannot create new client ${whatsappClientId}: No shipping address provided in order.`);
      return null;
    }
    // Case 2: Client doesnt exist, but gave an address
    console.log(`New client ${whatsappClientId} found. Creating with address provided.`);
    const newClientData = {
      shippingAddress: providedAddress
    };
    await clientDocRef.set(newClientData);
    console.log(`New Client ${whatsappClientId} created with the address: ${providedAddress}`);
    return newClientData;

  } else {
      // Client exists
      const clientData = clientDocSnapshot.data();
      const savedAddress = clientData.shippingAddress;

      // Client exists, has an saved address, and gave a new address
      if (providedAddress && providedAddress !== savedAddress) {
        console.log(`Given address (${providedAddress}) its different from the saved one (${savedAddress}). Updating the database.`);
        const updatedData = {
          shippingAddress: providedAddress,
          lastUpdated: new Date()
        };
        await clientDocRef.update(updatedData);
        console.log(`Client ${whatsappClientId} updated with address: ${providedAddress}`);
        // Return the updated client data
        return {...clientData, ...updatedData};

      } else {
          console.log(`Client ${whatsappClientId} address is up to date or none provided to update.`);
          return clientData;
      }
  }
}

async function handleNewClientAddress(agent) {

  const contextName = 'awaiting_address_for_new_client';

  try {

    const providedAddress = agent.parameters.newClientShippingAddress;
    const originalContext = agent.getContext(contextName);

    // Initial validations
    if (!originalContext || !originalContext.parameters) {
      console.error("Missing original context or parameters in handleNewClientAddress.");
      agent.add("Desculpe, perdi as informações da sua conversa. Por favor, refaça seu pedido");
      // Cleaning the context to dont activate this intent again
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;

    // Checking if the client id and the address are present
    if (!whatsappClientId || !providedAddress) {
      console.error("Missing essential data (client ID or provided address) in handleNewClientAddress. Client ID:", whatsappClientId, "Address:", providedAddress);
      agent.add("Desculpe, não consegui processar o endereço. Podemos tentar seu pedido novamente?");
      // Cleaning the context, because essential information are missing
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    console.log(`Handling new client address for ${whatsappClientId}: ${providedAddress}`);

    // Checking if the information was not missed
    validateOriginalOrderArrays(agent, originalParams, contextName);

    // Getting the original parameters
    const dozensArray = originalParams.originalOrderDozens;
    const method = originalParams.originalOrderMethod;
    const eggTypeArray = originalParams.originalOrderEggTypeArray;

    console.log("Original order parameters from context obtained:", { dozensArray, eggTypeArray, method });

    // Cleaning the context to not activate this context again, because we got what we need
    agent.setContext({ name: contextName, lifespan: 0 });
    console.log(`Context '${contextName}' cleared.`);

    // Editing the new address to the new client
    try {
      await ensureClientExistsAndAddressSaved(db, whatsappClientId, providedAddress);
      console.log(`New client profile created/updated for ${whatsappClientId} with address: ${providedAddress}`);
    } catch (clientSaveError) {
        console.error("Error ensuring client exists and address saved in handleNewClientAddress:", clientSaveError);
        agent.add(`Desculpe, tive um problema ao salvar seu endereço. Por favor, tente novamente.`);
        throw clientSaveError;
    }

    // Creating the parameters to save the order
    const orderParams = {
      dozensArray: dozensArray,
      eggTypeArray: eggTypeArray,
      method: method,
      shippingAddress: providedAddress
    };
    console.log("Passing order parameters to processOrderFlow from handleNewClientAddress:", orderParams);

    // Saving the order
    await processOrderFlow(agent, whatsappClientId, orderParams);
    console.log("processOrderFlow completed from handleNewClientAddress.");

  } catch (error) {
    console.error("An error occurred during handleNewClientAddress:", error);
    agent.add("Desculpe, tivemos um problema interno ao finalizar seu pedido. Por favor, tente novamente mais tarde.");
    // Cleaning the context
    agent.setContext({ name: contextName, lifespan: 0 });
    throw error;
  }
}

async function handleExistingClientAddress(agent) {
  
  const contextName = 'awaiting_address_for_existing_client';
  
  try {

    // Collecting the address from the saved context
    const providedAddress = agent.parameters.existingClientShippingAddress;
    const originalContext = agent.getContext(contextName);

    // Initial Validations
    if (!originalContext || !originalContext.parameters) {
      console.error("Missing original context or parameters in handleExistingClientAddress.");
      agent.add("Desculpe, perdi as informações da sua conversa. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;

    // Validating if the client id anda the address are here
    if (!whatsappClientId || !providedAddress) {
      console.error("Missing essential data (client ID or provided address) in handleExistingClientAddress. Client ID:", whatsappClientId, "Address:", providedAddress);
      agent.add("Desculpe, não consegui processar o endereço. Podemos tentar novamente?");
      // Cleaning the context
      agent.setContext({ name: 'awaiting_address_for_existing_client', lifespan: 0 });
      return;
    }
    console.log(`Handling existing client address for ${whatsappClientId}: ${providedAddress}`);

    // Checking if the information was not missed
    validateOriginalOrderArrays(agent, originalParams, contextName);

    // Collecting the original order parameters
    const dozensArray = originalParams.originalOrderDozensArray;
    const method = originalParams.originalOrderMethod;
    const eggTypeArray = originalParams.originalOrderEggTypeArray;

    console.log("Original order parameters from context obtained:", { dozensArray, eggTypeArray, method });

    // Cleaning the context
    agent.setContext({ name: contextName, lifespan: 0 });
    console.log(`Context '${contextName}' cleared.`);

    // Updating the client address
    try {
      await ensureClientExistsAndAddressSaved(db, whatsappClientId, providedAddress);
      console.log(`Existing client profile updated for ${whatsappClientId} with address: ${providedAddress}`);
    } catch (clientSaveError) {
      console.error("Error ensuring client exists and address saved in handleExistingClientAddress:", clientSaveError);
      agent.add(`Desculpe, tive um problema ao salvar seu endereço. Por favor, tente novamente.`);
      throw clientSaveError;
    }

    // Creating the parameters to save the order
    const orderParams = {
      dozensArray: dozensArray,
      method: method,
      eggTypeArray: eggTypeArray,
      shippingAddress: providedAddress
    };

    // Saving the order
    await processOrderFlow(agent, whatsappClientId, orderParams);
    console.log("processOrderFlow completed from handleExistingClientAddress.");

  } catch (error) {
    console.error("An error occurred during handleExistingClientAddress:", error);
    agent.add("Desculpe, tivemos um problema interno ao finalizar seu pedido. Por favor, tente novamente mais tarde.");
    // Cleaning the context
    agent.setContext({ name: contextName, lifespan: 0 });
    throw error;
  }
}

async function continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams) {
  
  try {

    const { dozensArray, method, eggTypeArray } = validatedOrderParams;

    // Collecting the client if it exists, if not making preparations to create one
    const clientDocRef = db.collection('clients').doc(whatsappClientId);
    const clientDocSnapshot = await clientDocRef.get();
    const clientData = clientDocSnapshot.exists ? clientDocSnapshot.data() : null;
    const savedAddress = clientData ? clientData.shippingAddress : null;

    const needsAddressPrompt = !clientDocSnapshot.exists || !savedAddress;

    // Checking if we need an address, or update the saved one
    if (needsAddressPrompt) {
      console.log(`Address missing for client ${whatsappClientId}. Asking for address.`);

      // Deciding which intent to use and which message to send
      const contextName = !clientDocSnapshot.exists ? 'awaiting_address_for_new_client' : 'awaiting_address_for_existing_client';
      const promptMessage = !clientDocSnapshot.exists
        ? "Parece que você é um novo cliente! Para anotar seu pedido, preciso saber seu endereço. Por favor, me diga qual é."
        : "Parece que seu perfil não tem um endereço salvo, e não recebi um neste pedido. Por favor, me diga qual é seu endereço.";
      agent.add(promptMessage);

      // Saving original parameters
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: dozensArray,
          originalOrderMethod: method,
          originalOrderEggTypeArray: eggTypeArray,
        }
      });
      return; 

    } else {
      // If we are here we got the address
      console.log("Address is available. Proceeding with order processing.");

      // Determining which address to use, a new one or a saved one
      const finalShippingAddressForOrder = savedAddress;
      console.log(`Client profile verified for ${whatsappClientId} with address provided (${finalShippingAddressForOrder}) or using saved.`);

      // Ensuring that it exists
      if (!finalShippingAddressForOrder) {
        console.error("Logic error: finalShippingAddressForOrder is null before proceeding.");
        agent.add(`Desculpe, houve um problema inesperado com seu endereço. Por favor, tente novamente.`);
        return;
      }

      // Creating order parameters
      const orderParams = {
        dozensArray: dozensArray,
        method: method,
        eggTypeArray: eggTypeArray,
        shippingAddress: finalShippingAddressForOrder
      };

      // Sending to a function do create it
      await processOrderFlow(agent, whatsappClientId, orderParams);
      console.log("processOrderFlow completed from continueOrderAfterValidation (using saved address).");
    }
  } catch (error) {
    console.error("An error occurred during initial order handler flow:", error);
    agent.add(`Desculpe, tive um problema interno. Por favor, tente novamente mais tarde.`);
    throw error;
  }
}

function validateOriginalOrderArrays(agent, originalParams, contextToClearName) {
  const originalDozensArray = originalParams.originalOrderDozensArray;
  const originalEggTypeArray = originalParams.originalOrderEggTypeArray;

  // Checking if the original parameters are here and in the expected format
  if (!Array.isArray(originalDozensArray) || !Array.isArray(originalEggTypeArray)) {
    console.error(`Validation failed: Missing or invalid original order arrays from context '${contextToClearName}'. Original Params:`, originalParams);
    agent.add("Desculpe, perdi algumas informações essenciais do seu pedido. Por favor, refaça seu pedido");
    // Cleaning the context
    agent.setContext({ name: contextToClearName, lifespan: 0 });
    // Throw an error to stop further execution in the calling function's try/catch
    throw new Error("Validation failed: Missing or invalid original order arrays in context.");
  }

  // Basic validation for arrays length
  if (originalDozensArray.length === 0 || originalDozensArray.length !== originalEggTypeArray.length) {
    console.error(`Validation failed: Mismatched or empty dozen/type arrays retrieved from context '${contextToClearName}'. Dozens: ${originalDozensArray}, Types: ${originalEggTypeArray}. Original Params:`, originalParams);
    agent.add("Desculpe, as informações do pedido parecem incompletas. Por favor, refaça seu pedido.");
    // Cleaning the context
    agent.setContext({ name: contextToClearName, lifespan: 0 });
    // Throw an error
    throw new Error("Validation failed: Mismatched or empty arrays in context.");
  }

  // If we reach here, validation passed
  console.log(`Original order arrays validated successfully from context '${contextToClearName}'.`);
  return true;
}

// Helper function to validate the method value
function validateMethodValue(agent, method) {
    const validMethods = [1, 2, 3, 4];
    if (typeof method !== 'number' || !validMethods.includes(method)) {
        console.warn(`Validation failed: Invalid payment method received: ${method}`);
        agent.add("Por favor, escolha uma forma de pagamento válida para o seu pedido:\n1. Cartão de Crédito\n2. Pix\n3. Débito\n4. Dinheiro");
        throw new Error(`Invalid payment method value: ${method}`);
    }
    console.log("Method value validated successfully.");
    return method;
}

async function handleCorrectedMethod(agent) {
  
  const contextName = 'awaiting_valid_method';
  
  try {

    // Collecting the new value for dozens and the original parameters
    const correctedMethod = agent.parameters.method;
    const originalContext = agent.getContext(contextName);

    // Initial validations
    if (!originalContext || !originalContext.parameters) {
      console.error("Missing original context or parameters in handleCorrectedMethod.");
      agent.add("Desculpe, perdi as informações do seu pedido. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;

    //  Checking if the client id is here
    if (!whatsappClientId) {
      console.error("Missing client ID in handleCorrectedMethod. Original Params:", originalParams);
      agent.add("Desculpe, não consegui identificar seu usuário para processar a correção. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    console.log(`Handling corrected method for client ${whatsappClientId}. Context: '${contextName}'.`);

    // Checking if the information was not missed
    validateOriginalOrderArrays(agent, originalParams, contextName);

    // Collecting the original value for dozens
    const originalDozensArray = originalParams.originalOrderDozensArray;
    const originalEggTypeArray = originalParams.originalOrderEggTypeArray;
    console.log("Original order parameters from context obtained:", { originalDozensArray, originalEggTypeArray });

    // Validating the payment method provided by the client
    let validatedMethod;
    try {
      validatedMethod = validateMethodValue(agent, correctedMethod);
      // If validateMethodValue succeeds, it returns the method
      console.log("Corrected method value is valid.");

    } catch (methodValueError) {
      // catch block specifically for invalid method value
      console.warn(`Validation of corrected method value failed: ${methodValueError.message}. Staying in context '${contextName}'.`);
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: originalDozensArray,
          originalOrderEggTypeArray: originalEggTypeArray,
        }
      });
      return;
    }
    // If method validation passed
    console.log(`Corrected payment method validated for ${whatsappClientId}: ${validatedMethod}. Proceeding to address check.`);

    // Cleaning the current context because we got the valid method
    agent.setContext({ name: contextName, lifespan: 0 });
    console.log(`Context '${contextName}' cleared.`);

    // Prepare parameters for the next step
    const validatedOrderParams = {
      dozensArray: originalDozensArray,
      eggTypeArray: originalEggTypeArray,
      method: validatedMethod,
    };
    console.log("Calling continueOrderAfterValidation with:", validatedOrderParams);

    // Continue the order flow
    await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);
    console.log("continueOrderAfterValidation completed from handleCorrectedMethod.");

  } catch (error) {
    console.error("An error occurred during handleCorrectedMethod:", error);
    // Check if a user-friendly message was already added by a helper function
    // If not, add a generic error message
    if (!agent.responseMessages || agent.responseMessages.length === 0) {
      agent.add("Desculpe, tivemos um problema interno ao processar a forma de pagamento. Por favor, refaça seu pedido");
    }
    // Cleaning the context
    agent.setContext({ name: contextName, lifespan: 0 });
  }
}

// Helper function to validate the values within the egg type array
function validateEggTypeArrayValues(agent, eggTypeArray) {
    if (!Array.isArray(eggTypeArray) || eggTypeArray.length === 0) {
         // Safety check
         console.error("Validation failed: Egg type array is not an array or is empty.");
         agent.add("Desculpe, os tipos de ovo parecem incorretos. Por favor, refaça seu pedido.");
         throw new Error("Invalid egg type array structure.");
    }

    const validEggTypes = ['extra', 'jumbo'];
     let validatedEggTypeArray = [];

    for (const type of eggTypeArray) {
        const normalizedType = typeof type === 'string' ? type.toLowerCase() : '';
        if (!validEggTypes.includes(normalizedType)) {
             console.warn(`Validation failed: Invalid egg type found in array: ${type}`);
             agent.add(`Não reconheci um dos tipos de ovo ("${type}"). Por favor, diga Extra ou Jumbo para cada quantidade.`);
             throw new Error(`Invalid egg type value: ${type}`);
        }
         validatedEggTypeArray.push(normalizedType);
    }
    console.log("Egg type array values validated successfully.");
    // Return the normalized array
    return validatedEggTypeArray;
}

async function handleCorrectedEggTypeMixedOrder(agent) {
  const contextName = 'awaiting_valid_egg_type_mixed_order';
  const methodContextName = 'awaiting_valid_method';

  try {
    
    const correctedEggTypeArray = agent.parameters.eggType;
    console.log("Received corrected egg type array:", correctedEggTypeArray);

    // Get original context and parameters
    const originalContext = agent.getContext(contextName);

    // Initial validations
    if (!originalContext || !originalContext.parameters) {
      console.error(`Missing original context or parameters in ${contextName} handler.`);
      agent.add("Desculpe, perdi as informações do seu pedido. Por favor, refaça seu pedido");
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;

    if (!whatsappClientId) {
      console.error(`Missing client ID in ${contextName} handler. Original Params:`, originalParams);
      agent.add("Desculpe, não consegui identificar seu usuário para processar a correção. Por favor, refaça seu pedido");
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    console.log(`Handling corrected egg types for client ${whatsappClientId}. Context: '${contextName}'.`);

    validateOriginalOrderArrays(agent, originalParams, contextName);

    // Retrieve original order parameters from context
    const originalDozensArray = originalParams.originalOrderDozensArray;
    const originalMethod = originalParams.originalOrderMethod;

    // Check if the corrected egg types array has the expected length based on the saved dozens array
    if (!Array.isArray(correctedEggTypeArray) || correctedEggTypeArray.length !== originalDozensArray.length) {
      console.warn(`Mismatched or invalid corrected egg types array structure received: ${correctedEggTypeArray}. Expected length based on dozens: ${originalDozensArray.length}`);
      agent.add(`A quantidade de tipos de ovo que você disse não corresponde à quantidade de dúzias que você pediu anteriormente. Por favor, diga o tipo correto (Extra ou Jumbo) para cada quantidade.`);

      // Reprompt by setting the same context again, passing original details back
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: originalDozensArray,
          originalOrderMethod: originalMethod,
        }
      });
      return;
     }


    // Validate the values within the corrected egg types array
    let validatedEggTypeArray = [];
    try {
      validatedEggTypeArray = validateEggTypeArrayValues(agent, correctedEggTypeArray);
      // If validateEggTypeArrayValues succeeds, it returns the normalized array
      console.log("Corrected egg type values are valid.");

    } catch (typeValueError) {
      console.warn(`Validation of corrected egg type values failed: ${typeValueError.message}. Staying in context '${contextName}'.`);
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: originalDozensArray,
          originalOrderMethod: originalMethod,
        }
      });
      return;
    }
    // End of egg type value validation

    console.log("Corrected egg types values are valid. Now validating method from context.");
    try {
      // Validate the value of the original method from context
      // This helper throws if invalid
      validateMethodValue(agent, originalMethod);
      console.log("Original method from context is valid. All parameters are validated.");

      // If all validations passed
      // Clear the current context as we have all valid info
      agent.setContext({ name: contextName, lifespan: 0 });
      console.log(`Context '${contextName}' cleared.`);

      // Prepare parameters for the next step
      const validatedOrderParams = {
        dozensArray: originalDozensArray,
        eggTypeArray: validatedEggTypeArray,
        method: originalMethod,
      };
      console.log("Calling continueOrderAfterValidation with:", validatedOrderParams);

      // Continue the order flow
      await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);
      console.log("continueOrderAfterValidation completed from handleCorrectedEggTypeMixedOrder.");

    } catch (methodError) {
      // Catch block for validateMethodValue failing
      console.warn(`Validation of original method failed after types correction: ${methodError.message}. Setting context '${methodContextName}'.`);
      agent.setContext({
        name: methodContextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: originalDozensArray,
          originalOrderEggTypeArray: validatedEggTypeArray,
        }
      });
      return;
    }

  } catch (error) {
    // This outer catch block now primarily handles errors thrown by:
    // - Missing context or client ID
    // - validateOriginalOrderArrays
    // - Mismatched corrected egg type array length
    // - Any unexpected errors *not* caught by the specific inner catches

    console.error(`An error occurred during ${contextName} handler for client ${whatsappClientId}:`, error);

    // Check if a user-friendly message was already added by a helper function
    // If not, add a generic error message
    if (!agent.responseMessages || agent.responseMessages.length === 0) {
      agent.add("Desculpe, tivemos um problema interno ao processar os tipos de ovo. Por favor, refaça seu pedido");
    }

    // Clean the current context on any unexpected error
    agent.setContext({ name: contextName, lifespan: 0 });
  }
}

// Helper function to validate the values within the dozens array
function validateDozensArrayValues(agent, dozensArray) {
    if (!Array.isArray(dozensArray) || dozensArray.length === 0) {
         console.error("Validation failed: Dozens array is not an array or is empty.");
         agent.add("Desculpe, as quantidades de dúzias parecem incorretas. Por favor, refaça seu pedido.");
         throw new Error("Invalid dozens array structure.");
    }

    for (const dozen of dozensArray) {
        if (typeof dozen !== 'number' || dozen <= 0 || !Number.isInteger(dozen)) {
          console.warn(`Validation failed: Invalid or non-positive integer found in dozens array: ${dozen}`);
          agent.add("Parece que um dos números de dúzias não é válido. Por favor, diga um número inteiro positivo para cada tipo.");
          throw new Error(`Invalid dozen value: ${dozen}`);
        }
    }
    console.log("Dozens array values validated successfully.");
    return dozensArray;
}

async function handleCorrectedDozensMixedOrder(agent) {

  const contextName = 'awaiting_valid_dozens_mixed_order';
  const eggTypeContextName = 'awaiting_valid_egg_type_mixed_order';
  const methodContextName = 'awaiting_valid_method';

  try {

    // Collecting the new value for dozens and the original parameters
    const correctedDozensArray = agent.parameters.dozens;
    console.log("Received corrected dozens array:", correctedDozensArray);

    const originalContext = agent.getContext(contextName);

    // Initial validations
    if (!originalContext || !originalContext.parameters) {
      console.error("Missing original context or parameters in handleCorrectedDozens.");
      agent.add("Desculpe, perdi as informações do seu pedido. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;

    //  Checking if the client id is here
    if (!whatsappClientId) {
      console.error("Missing client ID in handleCorrectedDozens. Original Params:", originalParams);
      agent.add("Desculpe, não consegui identificar seu usuário para processar a correção. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    console.log(`Handling corrected dozens for client ${whatsappClientId}. Context: '${contextName}'.`);

    // This helper throws if structure is bad and clears context
    validateOriginalOrderArrays(agent, originalParams, contextName);

    // Retrieve original order parameters from context (now safe as structure is validated)
    const originalEggTypeArray = originalParams.originalOrderEggTypeArray;
    const originalMethod = originalParams.originalOrderMethod;

    // Check if the corrected dozens array has the expected length based on the saved types array
    if (!Array.isArray(correctedDozensArray) || correctedDozensArray.length !== originalEggTypeArray.length) {
      console.warn(`Mismatched or invalid corrected dozens array structure received: ${correctedDozensArray}. Expected length based on types: ${originalEggTypeArray.length}`);
      agent.add(`A quantidade de números que você disse não corresponde à quantidade de tipos de ovos que você pediu anteriormente. Por favor, diga a quantidade correta para cada tipo de ovo que você quer (${originalEggTypeArray.join(' e ')}).`);

      // Reprompt by setting the same context again, passing original details back
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderEggTypeArray: originalEggTypeArray,
          originalOrderMethod: originalMethod,
        }
      });
      return;
    }

    try{
      // This helper throws if values are invalid
      const validatedDozensArray = validateDozensArrayValues(agent, correctedDozensArray);
      console.log("Corrected dozens values are valid.");
      
      // Prociding to validate egg types
      console.log("Corrected dozens values are valid. Now validating egg types from context.");
      let validatedEggTypeArray = [];
      try {
        // This helper throws if invalid and returns the normalized array
        validatedEggTypeArray = validateEggTypeArrayValues(agent, originalEggTypeArray);

        // If egg types validation passed, proceed to validate the method
        console.log("Original egg types from context are valid. Now validating method from context.");
        try {
          // Validate the value of the original method from context
          validatedMethod = validateMethodValue(agent, originalMethod);

          // If all validations passed
          console.log("Original method from context is valid. All parameters are validated.");

          // Clear the current context as we have all valid info
          agent.setContext({ name: contextName, lifespan: 0 });
          console.log(`Context '${contextName}' cleared.`);

          // Prepare parameters for the next step
          const validatedOrderParams = {
            dozensArray: validatedDozensArray,
            eggTypeArray: validatedEggTypeArray,
            method: validatedMethod,
          };
          console.log("Calling continueOrderAfterValidation with:", validatedOrderParams);

          // Continue the order flow
          await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);
          console.log("continueOrderAfterValidation completed from handleCorrectedDozensMixedOrder.");

        } catch (methodError) {
          // Catch block for validateMethodValue failing
          console.warn(`Validation of original method failed after dozens and types correction: ${methodError.message}. Setting context '${methodContextName}'.`);
          // Redirect to the method correction handler
          agent.setContext({
            name: methodContextName,
            lifespan: 2,
            parameters: {
              whatsappClientId: whatsappClientId,
              originalOrderDozensArray: validatedDozensArray,
              originalOrderEggTypeArray: validatedEggTypeArray,
            }
          });
          return;
        }

      } catch (typeError) {
        // Catch block for validateEggTypeArrayValues failing
        console.warn(`Validation of original egg types failed after dozens correction: ${typeError.message}. Setting context '${eggTypeContextName}'.`);
        // Redirect to the egg type correction handler
        agent.setContext({
          name: eggTypeContextName, 
          lifespan: 2,
          parameters: {
            whatsappClientId: whatsappClientId,
            originalOrderDozensArray: validatedDozensArray,
            originalOrderMethod: originalMethod,
          }
        });
        return;
      }
    } catch (dozenValueError) {
      // Catch block for validateDozensArrayValue failing
      console.warn(`Validation of corrected dozens values failed: ${dozenValueError.message}. Staying in context '${contextName}'.`);
      // Redirect to the same handler to try to correct it again
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderEggTypeArray: originalEggTypeArray,
          originalOrderMethod: originalMethod,
        }
      });
      return;
    }
  } catch (error) {
    // This catch block handles errors thrown by:
    // - Missing context or client ID
    // - validateOriginalOrderArrays (structure validation)
    // - validateDozensArrayValues (value validation)
    // - Any unexpected errors

    console.error(`An error occurred during ${contextName} handler for client ${whatsappClientId}:`, error);

    // Check if a user-friendly message was already added by a helper function
    // If not, add a generic error message
     if (!agent.responseMessages || agent.responseMessages.length === 0) {
         agent.add("Desculpe, tivemos um problema interno ao processar a quantidade. Por favor, refaça seu pedido");
     }

    // Clean the current context on any error as a safety measure
    agent.setContext({ name: contextName, lifespan: 0 });
  }
}

// 
async function handleOrder(agent) {

  const dozensContextName = 'awaiting_valid_dozens_mixed_order';
  const eggTypeContextName = 'awaiting_valid_egg_type_mixed_order';
  const methodContextName = 'awaiting_valid_method';

  try {

    // Validating the client id
    //const whatsappClientId = agent.parameters.whatsappClientId;

    // Test purposes only
    const whatsappClientId = 'whatsapp:+15551234568';

    if (!whatsappClientId){
      console.error("WhatsApp Client ID not received in the Fulfillment.");
      agent.add("Desculpe, não consegui identificar seu usuário para fazer o pedido. Por favor, tente novamente mais tarde.");
      return;
    }
    console.log("WhatsApp Client ID received:", whatsappClientId);

    // Getting the parameters from dialogflow
    const dozensArray = agent.parameters.dozens;
    const method = Number(agent.parameters.method[0]);
    const eggTypeArray = agent.parameters.eggType;

    console.log("Received dozens array:", dozensArray);
    console.log("Received egg type array:", eggTypeArray);
    console.log("Received method:", method);

    // Validating mixed orders
    if (!Array.isArray(dozensArray) || !Array.isArray(eggTypeArray) || dozensArray.length === 0 || eggTypeArray.length === 0 || dozensArray.length !== eggTypeArray.length) {
      console.warn(`Mismatched or missing dozens/egg type arrays. Dozens: ${dozensArray}, Types: ${eggTypeArray}`);
      agent.add("Para um pedido misto, por favor, diga a quantidade e o tipo para cada item, como '3 dúzias extra e 2 dúzias jumbo'.");

      return;
    }
    console.log("All dozens values validated.");

    // Validate each dozen value individually
    for (const dozen of dozensArray) {
      if (typeof dozen !== 'number' || dozen <= 0 || !Number.isInteger(dozen)) {
        console.warn(`Invalid or non-positive integer found in dozens array: ${dozen}. Setting context '${dozensContextName}'.`);
        agent.add("Parece que um dos números de dúzias não é válido. Por favor, diga um número inteiro positivo para cada tipo.");
        
        // Validating the dozen values
        agent.setContext({
            name: dozensContextName,
            lifespan: 2,
            parameters: {
              whatsappClientId: whatsappClientId,
              originalOrderEggTypeArray: eggTypeArray,
              originalOrderMethod: method,
            }
          });
        return;
      }
    }
    console.log("All dozens values validated.");

    // Validate each egg type value individually
    const validEggTypes = ['extra', 'jumbo'];
    const validatedEggTypeArray = eggTypeArray.map(type => type.toLowerCase());

    for (const type of validatedEggTypeArray) {
      if (!validEggTypes.includes(type)) {
        console.warn(`Invalid egg type found in array: ${type}. Setting context '${eggTypeContextName}'.`);
        agent.add(`Não reconheci um dos tipos de ovo. Por favor, diga Extra ou Jumbo.`);
        
        // Set the new context to handle the correction, passing the other valid details
        agent.setContext({
          name: eggTypeContextName,
          lifespan: 2,
          parameters: {
            whatsappClientId: whatsappClientId,
            originalOrderDozensArray: dozensArray,
            originalOrderMethod: method,
          }
        });
        return;
      }
    }
    console.log("All egg types validated.");

    // Validating the payment method provided by the client
    const validMethods = [1, 2, 3, 4];

    if (typeof method !== 'number' || !validMethods.includes(method)) {
      console.warn(`Invalid payment method received: ${method}`);
      agent.add("Por favor, escolha uma forma de pagamento válida.\nQual será a forma de pagamento?\n1. Cartão de Crédito\n2. Pix\n3. Débito");
      
      // Redirecting the client to receive a valid value for method
      agent.setContext({
        name: methodContextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: dozensArray,
          originalOrderEggTypeArray: validatedEggTypeArray,
        }
      });
      return;
    }
    console.log("Payment method validated:", method);

    // Saving the validated parameters
    console.log("All initial parameters validated. Proceeding to continueOrderAfterValidation.");
    const validatedOrderParams = {
      dozensArray: dozensArray,
      eggTypeArray: validatedEggTypeArray,
      method: method,
    };

    // Continue the order
    await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);
    console.log("continueOrderAfterValidation completed from handleOrder.");

  } catch (error) {
    console.error("An error occurred during initial order handler flow:", error);
    agent.add(`Desculpe, tive um problema interno. Por favor, tente novamente mais tarde.`);
    throw error;
  }
}

function webhookEntry(agent) {
  let intentMap = new Map();

  intentMap.set('Order Intent', handleOrder);
  intentMap.set('Capture New Client Address Intent', handleNewClientAddress);
  intentMap.set('Capture Existing Client Address Intent', handleExistingClientAddress);
  intentMap.set('Capture Corrected Dozens Mixed Order Intent', handleCorrectedDozensMixedOrder);
  intentMap.set('Capture Corrected Egg Type Mixed Order Intent', handleCorrectedEggTypeMixedOrder);
  intentMap.set('Capture Corrected Method Intent', handleCorrectedMethod);

  intentMap.set('My Orders Intent', handleMyOrders);

  intentMap.set('Cancel Order Request Intent', handleCancelOrderRequest);
  intentMap.set('Cancel Order Selection Intent', handleCancelOrderSelection);

  console.log("Executing intent handler:", agent.intent);
  agent.handleRequest(intentMap);
}

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  webhookEntry(agent);
});