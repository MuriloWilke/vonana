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

async function ensureClientExistsAndAddressSaved(db, whatsappClientId, providedAddress) {

  if (!providedAddress) {
    console.error(`Invalid address provided for client ${whatsappClientId}:`, addressToSave);
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

async function getOrderConfiguration(db) {
  const configDocRef = db.collection('configurations').doc('1');
  const docSnapshot = await configDocRef.get();

  if (!docSnapshot.exists) {
    console.error("Configuration document with id '1' not found.");
    return null;
  }

  const data = docSnapshot.data();
  const dozenValue = data.dozenValue;
  const freeShipping = data.freeShipping;
  const shippingValue = data.shippingValue;

  if (dozenValue === undefined || freeShipping === undefined || shippingValue === undefined) {
    console.error("Missing essential configuration fields in document 1:", data);
    return null;
  }

  return { dozenValue, freeShipping, shippingValue };
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

async function processOrderFlow(agent, whatsappClientId, orderParams) {
  const { dozens, method, shippingAddress: finalShippingAddressForOrder } = orderParams;

  // Read configurations
  const config = await getOrderConfiguration(db);
  if (!config) {
    agent.add(`Desculpe, tivemos um problema técnico ao obter as configurações. Por favor, tente novamente mais tarde.`);
    throw new Error("Failed to load configuration.");
  }
  const { dozenValue, freeShipping, shippingValue } = config;
  console.log("Config loaded:", config);

  // Calculate final value
  let finalValue = dozenValue * dozens;
  if (dozens < freeShipping) {
    finalValue += shippingValue;
  }
  console.log("Final value calculated:", finalValue, "(Shipping included:", dozens < freeShipping, ")");

  // Creating the formatter for the final value
  const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

  // Formatted value
  const finalValueFormatted = formatter.format(finalValue / 100);

  // Formatted method
  const finalMethod = interpretFinalMethod(method);

  // Create and save order
  const newOrderDetails = {
    clientId: whatsappClientId,
    creationDate: new Date(),
    deliveryDate: null,
    deliveryStatus: 'Pendente',
    dozens: dozens,
    paymentMethod: finalMethod,
    shippingAddress: finalShippingAddressForOrder,
    total: finalValue,
  };

  const docRef = await createAndSaveOrder(db, newOrderDetails);
  console.log('Order saved successfully.');

  // Response
  agent.add(`Perfeito! Anotei seu pedido de ${dozens} de ovos para o endereço ${finalShippingAddressForOrder}. O total é ${finalValueFormatted}.`);
  agent.add(`O ID do seu pedido é ${docRef.id}. Se precisar de alguma ajuda, mande uma mensagem!`);

}

async function continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams) {
  
  try {

    const { dozens, method, } = validatedOrderParams;

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
          originalOrderDozens: dozens,
          originalOrderMethod: method,
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
        dozens: dozens,
        method: method,
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

async function handleOrder(agent) {

  try {

    // Validating the client id
    const whatsappClientId = agent.parameters.whatsappClientId;
    if (!whatsappClientId){
      console.error("WhatsApp Client ID not received in the Fulfillment.");
      agent.add("Desculpe, não consegui identificar seu usuário para fazer o pedido. Por favor, tente novamente mais tarde.");
      return;
    }
    console.log("WhatsApp Client ID received:", whatsappClientId);

    // Getting the parameters from dialogflow
    const dozens = agent.parameters.dozens;
    const method = agent.parameters.finalMethod;

    // Validating the dozens provided by the client
    if (typeof dozens !== 'number' || dozens <= 0 || !Number.isInteger(dozens)) {
      console.warn(`Invalid or non-positive integer dozens received: ${dozens}`);
      agent.add("O número de dúzias deve ser um número inteiro positivo. Quantas dúzias você gostaria?");
      
      // Redirecting the client to receive a valid value for dozens
      agent.setContext({
        name: 'awaiting_valid_dozens',
        lifespan: 2,
        parameters: {
            whatsappClientId: whatsappClientId,
            originalOrderMethod: method
        }
      });

      return;
    }
    console.log("Dozens validated:", dozens);

    // Validating the payment method provided by the client
    const validMethods = [1, 2, 3, 4];
    if (typeof method !== 'number' || !validMethods.includes(method)) {
      console.warn(`Invalid payment method received: ${method}`);
      agent.add("Por favor, escolha uma forma de pagamento válida.\nQual será a forma de pagamento?\n1. Cartão de Crédito\n2. Pix\n3. Débito");
      
      // Redirecting the client to receive a valid value for method
      agent.setContext({
        name: 'awaiting_valid_method',
        lifespan: 2,
        parameters: {
            whatsappClientId: whatsappClientId,
            originalOrderDozens: dozens,
        }
      });

      return;
    }
    console.log("Payment method validated:", method);

    // Saving the validated parameters
    const validatedOrderParams = {
      dozens: dozens,
      method: method,
    };

    // Continue the order
    await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);

  } catch (error) {
    console.error("An error occurred during initial order handler flow:", error);
    agent.add(`Desculpe, tive um problema interno. Por favor, tente novamente mais tarde.`);
  }
}

async function handleNewClientAddress(agent) {

  try {

    const providedAddress = agent.parameters.newClientShippingAddress;
    const originalContext = agent.getContext('awaiting_address_for_new_client');

    // Initial validations
    if (!originalContext || !originalContext.parameters) {
      console.error("Missing original context or parameters in handleNewClientAddress.");
      agent.add("Desculpe, perdi as informações da sua conversa. Por favor, refaça seu pedido");
      // Cleaning the context to dont activate this intent again
      agent.setContext({ name: 'awaiting_address_for_new_client', lifespan: 0 });
      return;
    }

    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;

    // Checking if the client id and the address are present
    if (!whatsappClientId || !providedAddress) {
      console.error("Missing essential data (client ID or provided address) in handleNewClientAddress. Client ID:", whatsappClientId, "Address:", providedAddress);
      agent.add("Desculpe, não consegui processar o endereço. Podemos tentar seu pedido novamente?");
      // Cleaning the context, because essential information are missing
      agent.setContext({ name: 'awaiting_address_for_new_client', lifespan: 0 });
      return;
    }
    console.log(`Handling new client address for ${whatsappClientId}: ${providedAddress}`);

    // Getting the original parameters
    const dozens = originalParams.originalOrderDozens;
    const method = originalParams.originalOrderMethod;

    // Checking if the original parameters are here
    if (dozens === undefined || method === undefined) {
      console.error("Missing essential original order parameters from context in handleNewClientAddress. Original Params:", originalParams);
      agent.add("Desculpe, perdi algumas informações do seu pedido. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: 'awaiting_address_for_new_client', lifespan: 0 });
      return;
    }
    console.log("Original order parameters from context obtained:", { dozens, method });

    // Cleaning the context to not activate this context again, because we got what we need
    agent.setContext({ name: 'awaiting_address_for_new_client', lifespan: 0 });
    console.log(`Context 'awaiting_address_for_new_client' cleared.`);

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
      dozens: dozens,
      method: method,
      shippingAddress: providedAddress
    };

    // Saving the order
    await processOrderFlow(agent, whatsappClientId, orderParams);
    console.log("processOrderFlow completed from handleNewClientAddress.");

  } catch (error) {
    console.error("An error occurred during handleNewClientAddress:", error);
    agent.add("Desculpe, tivemos um problema interno ao finalizar seu pedido. Por favor, tente novamente mais tarde.");
  }
}

async function handleExistingClientAddress(agent) {
  try {

    // Collecting the address from the saved context
    const providedAddress = agent.parameters.existingClientShippingAddress;
    const originalContext = agent.getContext('awaiting_address_for_existing_client');

    // Initial Validations
    if (!originalContext || !originalContext.parameters) {
      console.error("Missing original context or parameters in handleExistingClientAddress.");
      agent.add("Desculpe, perdi as informações da sua conversa. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: 'awaiting_address_for_existing_client', lifespan: 0 });
      return;
    }

    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId; // Obtenha o ID do cliente salvo no contexto

    // Validating if the client id anda the address are here
    if (!whatsappClientId || !providedAddress) {
      console.error("Missing essential data (client ID or provided address) in handleExistingClientAddress. Client ID:", whatsappClientId, "Address:", providedAddress);
      agent.add("Desculpe, não consegui processar o endereço. Podemos tentar novamente?");
      // Cleaning the context
      agent.setContext({ name: 'awaiting_address_for_existing_client', lifespan: 0 });
      return;
    }
    console.log(`Handling existing client address for ${whatsappClientId}: ${providedAddress}`);

    // Collecting the original order parameters
    const dozens = originalParams.originalOrderDozens;
    const method = originalParams.originalOrderMethod;

    // Checking if the original parameters are here
    if (dozens === undefined || method === undefined) {
      console.error("Missing essential original order parameters from context in handleExistingClientAddress. Original Params:", originalParams);
      agent.add("Desculpe, perdi algumas informações do seu pedido. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: 'awaiting_address_for_existing_client', lifespan: 0 });
      return;
    }
    console.log("Original order parameters from context obtained:", { dozens, method });

    // Cleaning the context
    agent.setContext({ name: 'awaiting_address_for_existing_client', lifespan: 0 });
    console.log(`Context 'awaiting_address_for_existing_client' cleared.`);

    // Updating the client address
    try {
      await ensureClientExistsAndAddressSaved(db, whatsappClientId, providedAddress);
      console.log(`Existing client profile updated for ${whatsappClientId} with address: ${providedAddress}`);
    } catch (clientSaveError) {
      console.error("Error ensuring client exists and address saved in handleExistingClientAddress:", clientSaveError);
      agent.add(`Desculpe, tive um problema ao salvar seu endereço. Por favor, tente novamente.`);
      throw clientSaveError; // Rethrow para o catch externo
    }

    // Creating the parameters to save the order
    const orderParams = {
      dozens: dozens,
      method: method,
      shippingAddress: providedAddress
    };

    // Saving the order
    await processOrderFlow(agent, whatsappClientId, orderParams);
    console.log("processOrderFlow completed from handleExistingClientAddress.");

  } catch (error) {
      console.error("An error occurred during handleExistingClientAddress:", error);
      agent.add("Desculpe, tivemos um problema interno ao finalizar seu pedido. Por favor, tente novamente mais tarde.");
  }
}

async function handleCorrectedDozens(agent) {
  try {

    // Collecting the new value for dozens and the original parameters
    const correctedDozens = agent.parameters.dozens;
    const originalContext = agent.getContext('awaiting_valid_dozens');

    // Initial validations
    if (!originalContext || !originalContext.parameters) {
      console.error("Missing original context or parameters in handleCorrectedDozens.");
      agent.add("Desculpe, perdi as informações do seu pedido. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: 'awaiting_valid_dozens', lifespan: 0 });
      return;
    }
    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;

    //  Checking if the client id is here
    if (!whatsappClientId) {
      console.error("Missing client ID in handleCorrectedDozens. Original Params:", originalParams);
      agent.add("Desculpe, não consegui identificar seu usuário para processar a correção. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: 'awaiting_valid_dozens', lifespan: 0 });
      return;
    }

    // Validating the new dozens value
    if (typeof correctedDozens !== 'number' || correctedDozens <= 0 || !Number.isInteger(correctedDozens)) {
      console.warn(`Invalid or non-positive integer corrected dozens received for ${whatsappClientId}: ${correctedDozens}. Reprompting.`);
      agent.add(`"${correctedDozens}" ainda não parece ser um número válido de dúzias. Por favor, diga um número inteiro positivo.`);
      // Trying it again
      agent.setContext({ name: 'awaiting_valid_dozens', lifespan: 1, parameters: originalParams });
      return;
    }
    // Validation went right
    console.log(`Corrected dozens validated for ${whatsappClientId}: ${correctedDozens}.`);

    // Cleaning the context
    agent.setContext({ name: 'awaiting_valid_dozens', lifespan: 0 });
    console.log(`Context 'awaiting_valid_dozens' cleared.`);

    // Collecting the method
    const originalMethod = originalParams.originalOrderMethod;

    // Validating the payment method provided by the client
    const validMethods = [1, 2, 3, 4];
    if (typeof originalMethod !== 'number' || !validMethods.includes(originalMethod)) {
      console.warn(`Invalid payment method received: ${originalMethod}`);
      agent.add("Por favor, escolha uma forma de pagamento válida.\nQual será a forma de pagamento?\n1. Cartão de Crédito\n2. Pix\n3. Débito");
      
      // Redirecting the client to receive a valid value for method
      agent.setContext({
        name: 'awaiting_valid_method',
        lifespan: 2,
        parameters: {
            whatsappClientId: whatsappClientId,
            originalOrderDozens: correctedDozens,
        }
      });
      return;

    } else {
      
      // The method provided by the client is valid
      console.log(`Method already captured and valid for ${whatsappClientId}: ${originalMethod}. Proceeding to address check.`);

      // Saving the validated parameters
      const validatedOrderParams = {
        dozens: correctedDozens,
        method: originalMethod,
      };

      // Continue the order
      await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);
    }
  } catch (error) {
    console.error("An error occurred during handleCorrectedDozens:", error);
    agent.add("Desculpe, tivemos um problema interno ao processar a quantidade. Por favor, refaça seu pedido");
    agent.setContext({ name: 'awaiting_valid_dozens', lifespan: 0 });
    throw error;
  }
}

async function handleCorrectedMethod(agent) {
  try {

    // Collecting the new value for dozens and the original parameters
    const correctedMethod = agent.parameters.method;
    const originalContext = agent.getContext('awaiting_valid_method');


    // Initial validations
    if (!originalContext || !originalContext.parameters) {
      console.error("Missing original context or parameters in handleCorrectedMethod.");
      agent.add("Desculpe, perdi as informações do seu pedido. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: 'awaiting_valid_method', lifespan: 0 });
      return;
    }
    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;

    //  Checking if the client id is here
    if (!whatsappClientId) {
      console.error("Missing client ID in handleCorrectedMethod. Original Params:", originalParams);
      agent.add("Desculpe, não consegui identificar seu usuário para processar a correção. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: 'awaiting_valid_method', lifespan: 0 });
      return;
    }

    // Collecting the original value for dozens
    const originalDozens = originalParams.originalOrderDozens;

    // Validating the payment method provided by the client
    const validMethods = [1, 2, 3, 4];
    if (typeof correctedMethod !== 'number' || !validMethods.includes(correctedMethod)) {
      console.warn(`Invalid payment method received: ${correctedMethod}`);
      agent.add("Por favor, escolha uma forma de pagamento válida.\nQual será a forma de pagamento?\n1. Cartão de Crédito\n2. Pix\n3. Débito");
      
      // Redirecting the client to receive a valid value for method
      agent.setContext({
        name: 'awaiting_valid_method',
        lifespan: 2,
        parameters: {
            whatsappClientId: whatsappClientId,
            originalOrderDozens: originalDozens,
        }
      });

      return;
    } else {
      
      // The method provided by the client is valid
      console.log(`Method already captured and valid for ${whatsappClientId}: ${correctedMethod}. Proceeding to address check.`);

      // Saving the validated parameters
      const validatedOrderParams = {
        dozens: originalDozens,
        method: correctedMethod,
      };

      // Continue the order
      await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);
    }
  } catch (error) {
    console.error("An error occurred during handleCorrectedMethod:", error);
    agent.add("Desculpe, tivemos um problema interno ao processar a forma de pagamento. Por favor, refaça seu pedido");
    // Cleaning the context
    agent.setContext({ name: 'awaiting_valid_method', lifespan: 0 });
    throw error;
  }
}

function webhookEntry(agent) {
  let intentMap = new Map();

  intentMap.set('Order Intent', handleOrder);
  intentMap.set('Capture New Client Address Intent', handleNewClientAddress);
  intentMap.set('Capture Existing Client Address Intent', handleExistingClientAddress);
  intentMap.set('Capture Corrected Dozens Intent', handleCorrectedDozens);
  intentMap.set('Capture Corrected Method Intent', handleCorrectedMethod);

  console.log("Executing intent handler:", agent.intent);
  agent.handleRequest(intentMap);
}

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  webhookEntry(agent);
});