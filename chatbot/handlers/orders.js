const { validateDeliveryDayValue } = require('../utils/deliveryUtils');
const { continueOrderAfterValidation, createAndSaveOrder } = require('../services/orderService');
const { validateMethodValue } = require('../utils/validationUtils');
const { interpretFinalMethod } = require('../utils/paymentUtils');

const ORDER_CONTEXT = 'awaiting_order_details';
const QTY_CONTEXT = 'new_order_awaiting_quantity';
const TYPE_CONTEXT = 'new_order_awaiting_type';
const ADD_MORE_CONTEXT = 'new_order_awaiting_add_more';
const DAY_CONTEXT = 'new_order_awaiting_day';
const METHOD_CONTEXT = 'new_order_awaiting_method';

/**
 * Main "State Machine" handler for the order flow.
 * It checks what information is missing and asks the next question.
 * @param {WebhookClient} agent
 */
async function handleOrder(agent) {
  try {
    const sessionPath = agent.session;
    const whatsappClientId = sessionPath.split('/sessions/')[1];

    if (!whatsappClientId) {
      console.error("WhatsApp Client ID not received in handleOrder.");
      agent.add("Desculpe, não consegui identificar seu usuário. Por favor, tente novamente mais tarde.");
      return;
    }

    // Get or Create the Order Object from context
    let currentOrder;
    const orderContext = agent.context.get(ORDER_CONTEXT);

    if (orderContext) {
      currentOrder = orderContext.parameters.currentOrder || { items: [], clientId: whatsappClientId };
    } else {
      currentOrder = { items: [], clientId: whatsappClientId };
    }
    
    // Pre-fill with any parameters the user provided *this turn*
    // (This handles the "fast track" case, e.g., "Quero 10 dúzias extra")
    prefillOrderFromParameters(agent, currentOrder);
    
    // State Machine: Check what's missing and ask for it
    if (currentOrder.items.length === 0) {
      agent.add("Certo! Vamos começar. Quantas dúzias você gostaria de adicionar?");
      setOrderContexts(agent, currentOrder, QTY_CONTEXT);
      return;
    }

    if (!currentOrder.deliveryDate) {
      agent.add("OK. Qual o dia para entrega?\n\n1. *Segunda*\n2. *Quinta*");
      setOrderContexts(agent, currentOrder, DAY_CONTEXT);
      return;
    }

    if (!currentOrder.paymentMethod) {
      agent.add("Qual será a forma de pagamento?\n\n1. *Pix*\n2. *Crédito*\n3. *Débito*\n4. *Dinheiro*");
      setOrderContexts(agent, currentOrder, METHOD_CONTEXT);
      return;
    }

    // All data is collected. Move to address validation and confirmation.
    console.log("Order is complete, moving to validation:", currentOrder);

    // Clear all ordering contexts
    setOrderContexts(agent, currentOrder, null, 0); 
    
    // Format data to match what continueOrderAfterValidation expects
    const validatedOrderParams = {
      dozensArray: currentOrder.items.map(item => item.quantity),
      eggTypeArray: currentOrder.items.map(item => item.type),
      deliveryDate: currentOrder.deliveryDate,
      paymentMethod: currentOrder.paymentMethod,
    };

    await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);

  } catch (error) {
    console.error("An error occurred in handleOrder state machine:", error);
    agent.add(`Desculpe, tive um problema interno. Por favor, tente novamente mais tarde.`);
    agent.context.set({ name: ORDER_CONTEXT, lifespan: 0 });
    throw error;
  }
}

/**
 * Handles the 'Order - Capture Quantity' intent.
 * Validates the quantity and asks for the type.
 * @param {WebhookClient} agent
 */
async function handleCaptureQuantity(agent) {
  const { currentOrder, tempState } = getOrderContexts(agent);
  const quantity = agent.parameters.quantity;

  // Validate the input
  if (!quantity || typeof quantity !== 'number' || quantity <= 0 || !Number.isInteger(quantity)) {
    agent.add("Não entendi. Por favor, informe o número de dúzias que você deseja.");
    setOrderContexts(agent, currentOrder, QTY_CONTEXT, 2, tempState);
    return;
  }

  // Valid input: Save quantity temporarily and ask for type
  tempState.tempQuantity = quantity;
  agent.add(`Entendido, ${quantity} dúzia(s). Qual o tipo?\n\n1. *Extra*\n2. *Jumbo*`);
  setOrderContexts(agent, currentOrder, TYPE_CONTEXT, 2, tempState);
}

/**
 * Handles the 'Order - Capture Type' intent.
 * Validates the type, aggregates it into the cart, and asks to add more.
 * @param {WebhookClient} agent
 */
async function handleCaptureType(agent) {
  const { currentOrder, tempState } = getOrderContexts(agent);
  const eggType = agent.parameters.eggType ? agent.parameters.eggType.toLowerCase() : null;
  const quantity = tempState.tempQuantity;

  // Validate the input
  if (!eggType || !['extra', 'jumbo'].includes(eggType)) {
    // Invalid input: Re-ask
    agent.add("Desculpe, tipo inválido. Por favor, escolha:\n\n1. *Extra*\n2. *Jumbo*");
    setOrderContexts(agent, currentOrder, TYPE_CONTEXT, 2, tempState);
    return;
  }

  if (!quantity) {
    // Should not happen, but a good safeguard
    console.error("Lost quantity in context. Restarting item loop.");
    agent.add("Desculpe, perdi a quantidade. Quantas dúzias você gostaria?");
    setOrderContexts(agent, currentOrder, QTY_CONTEXT);
    return;
  }

  // --- Aggregation Logic ---
  const existingItem = currentOrder.items.find(item => item.type === eggType);
  let message;

  if (existingItem) {
    // Item exists: SUM the quantity
    existingItem.quantity += quantity;
    message = `Entendido! Somei mais ${quantity} dúzia(s) ${eggType}. Agora você tem um total de ${existingItem.quantity} dúzia(s) ${eggType}.`;
  } else {
    // New item: PUSH to array
    currentOrder.items.push({ quantity: quantity, type: eggType });
    message = `Perfeito, adicionei ${quantity} dúzia(s) ${eggType}.`;
  }

  // Clear the temporary quantity
  tempState.tempQuantity = null;

  // Ask to add more items
  agent.add(message + "\nDeseja adicionar mais algum item?\n\n1. *Sim*\n2. *Não*");
  setOrderContexts(agent, currentOrder, ADD_MORE_CONTEXT, 2, tempState);
}

/**
 * Handles the 'Order - Add More Items - yes' intent.
 * Loops back to ask for the next item's quantity.
 * @param {WebhookClient} agent
 */
async function handleWantsMoreItems(agent) {
  const { currentOrder, tempState } = getOrderContexts(agent);
  agent.add("Ok. Quantas dúzias para o próximo item?");
  setOrderContexts(agent, currentOrder, QTY_CONTEXT, 2, tempState);
}

/**
 * Handles the 'Order - Add More Items - no' intent.
 * Calls the main handleOrder() to proceed to the next part of the flow.
 * @param {WebhookClient} agent
 */
async function handleDoneAddingItems(agent) {
  // Pass control back to the main state machine
  return handleOrder(agent);
}

/**
 * Handles the 'Order - Capture Day' intent.
 * Validates the day and calls handleOrder() to proceed.
 * @param {WebhookClient} agent
 */
async function handleCaptureDay(agent) {
  const { currentOrder, tempState } = getOrderContexts(agent);
  const dayValue = Number(agent.parameters.deliveryDate);

  try {
    // Validate the day
    const deliveryDate = validateDeliveryDayValue(agent, dayValue);

    // Valid: Save and call main state machine
    currentOrder.deliveryDate = deliveryDate;
    setOrderContexts(agent, currentOrder, null, 0, tempState);
    return handleOrder(agent);
  } catch (error) {
    // Invalid day: Re-ask
    console.warn(`Invalid delivery day: ${dayValue}`);
    agent.add("Dia inválido. Por favor, escolha:\n\n1. *Segunda*\n2. *Quinta*");
    setOrderContexts(agent, currentOrder, DAY_CONTEXT, 2, tempState);
  }
}

/**
 * Handles the 'Order - Capture Method' intent.
 * Validates the method and calls handleOrder() to finalize.
 * @param {WebhookClient} agent
 */
async function handleCaptureMethod(agent) {
  console.log(agent.parameters.paymentMethod);
  const { currentOrder, tempState } = getOrderContexts(agent);
  const paymentMethod = Number(agent.parameters.paymentMethod);

  try {
    // Validate the method
    const validatedMethod = validateMethodValue(agent, paymentMethod);
    
    // Valid: Save and call main state machine
    currentOrder.paymentMethod = interpretFinalMethod(validatedMethod);
    
    setOrderContexts(agent, currentOrder, null, 0, tempState);
    return handleOrder(agent);
  } catch (error) {
    // Invalid method: Re-ask
    console.warn(`Invalid payment method: ${paymentMethod}`);
    agent.add("Método inválido. Por favor, escolha:\n\n 1. *Pix*\n2. *Crédito*\n3. *Débito*\n4. *Dinheiro*");
    setOrderContexts(agent, currentOrder, METHOD_CONTEXT, 2, tempState);
  }
}


// --- HELPER FUNCTIONS ---

/**
 * Safely retrieves the main order context and the temp state.
 * @param {WebhookClient} agent
 * @returns {{currentOrder: object, tempState: object}}
 */
function getOrderContexts(agent) {
  const orderContext = agent.context.get(ORDER_CONTEXT);
  const clientId = agent.session.split('/sessions/')[1];
  
  if (orderContext && orderContext.parameters.currentOrder) {
    return { 
      currentOrder: orderContext.parameters.currentOrder, 
      tempState: orderContext.parameters.tempState || {} 
    };
  }
  // Fallback in case context is lost
  return { 
    currentOrder: { items: [], clientId: clientId }, 
    tempState: {} 
  };
}

/**
 * Sets the main order context and a specific "state" context.
 * @param {WebhookClient} agent
 * @param {object} currentOrder - The main order object to save.
 * @param {string} stateContextName - The name of the specific context to set (e.g., 'awaiting_item_quantity').
 * @param {number} [lifespan=2] - The lifespan for the contexts.
 * @param {object} [tempState={}] - Temporary state to persist (like tempQuantity).
 */
function setOrderContexts(agent, currentOrder, stateContextName, lifespan = 2, tempState = {}) {
  // Clear all other state contexts
  const allStates = [QTY_CONTEXT, TYPE_CONTEXT, ADD_MORE_CONTEXT, DAY_CONTEXT, METHOD_CONTEXT];
  allStates.forEach(ctx => {
    if (ctx !== stateContextName) {
      agent.context.set({ name: ctx, lifespan: 0 });
    }
  });

  // Set the specific state context for the next step
  if (stateContextName && lifespan > 0) {
    agent.context.set({ name: stateContextName, lifespan: lifespan });
  }

  // Persist the main order object
  agent.context.set({
    name: ORDER_CONTEXT,
    lifespan: lifespan,
    parameters: {
      currentOrder: currentOrder,
      tempState: tempState
    }
  });
}

/**
 * Pre-fills the order object with parameters from the user's *first* message.
 * @param {WebhookClient} agent
 * @param {object} currentOrder
 */
function prefillOrderFromParameters(agent, currentOrder) {
  // Only prefill if items are empty (i.e., it's the first pass)
  if (currentOrder.items.length > 0) return;

  const dozensArray = agent.parameters.dozens;
  const eggTypeArray = agent.parameters.eggType;
  const deliveryDate = Number(agent.parameters.deliveryDate);
  const paymentMethod = Number(agent.parameters.paymentMethod);

  // Prefill items (handles "2 dúzias extra e 1 jumbo")
  if (Array.isArray(dozensArray) && Array.isArray(eggTypeArray) && dozensArray.length === eggTypeArray.length) {
    for (let i = 0; i < dozensArray.length; i++) {
      const qty = Number(dozensArray[i]);
      const type = eggTypeArray[i] ? eggTypeArray[i].toLowerCase() : null;
      if (qty > 0 && type && ['extra', 'jumbo'].includes(type)) {
        // Use aggregation logic right away
        const existingItem = currentOrder.items.find(item => item.type === type);
        if (existingItem) {
          existingItem.quantity += qty;
        } else {
          currentOrder.items.push({ quantity: qty, type: type });
        }
      }
    }
  }

  // Prefill delivery day
  try {
    currentOrder.deliveryDate = validateDeliveryDayValue(agent, deliveryDate);
  } catch (e) { /* ignore invalid day */ }

  // Prefill payment method
  try {
    const validatedMethod = validateMethodValue(agent, paymentMethod);
    currentOrder.paymentMethod = interpretFinalMethod(paymentMethod);
  } catch (e) { /* ignore invalid method */ }
}

/**
 * Handles the user's confirmation of the order.
 * It checks the user's response to confirm, edit, or cancel the order.
 */
async function handleOrderConfirmation(agent) {
  const contextName = 'awaiting_order_confirmation';
  const editContext = 'awaiting_order_edit';

  try {

    // Retrieve context containing the order to confirm
    const context = agent.context.get(contextName);
    
    // If no valid context/order found, notify user and clear context
    if (!context || !context.parameters?.orderToConfirm) {
      agent.add("Desculpe, parece que perdi o pedido");
      
      agent.context.set({ name: contextName, lifespan: 0 });
      
      return;
    }

    // Get the user's confirmation action from their message
    const action = agent.parameters.confirmationMessage[0];

    // Handle cancellation request
    if (action === 'Cancelar') {
      agent.add("O pedido foi cancelado com sucesso. Se precisar de algo, estou à disposição.");
      
      agent.context.set({ name: contextName, lifespan: 0 });
      
      return;
    }

    // Handle request to edit the order
    if (action === 'Editar') {
      agent.add("Sem problemas! O que você gostaria de alterar? \n\n1. *Data de entrega*\n2. *Itens*\n3. *Método de Pagamento*\n4. *Endereço*");
      
      agent.context.set({ name: contextName, lifespan: 0 });

      agent.context.set({
        name: editContext,
        lifespan: 5,
        parameters: {
          orderToEdit: context.parameters.orderToConfirm
        }
      });
      
      return;
    }

    // Handle order confirmation
    if (action === 'Confirmar') {

      // Parse the order object
      const order = context.parameters.orderToConfirm;

      // Converting strings to Date Object
      order.deliveryDate = new Date(order.deliveryDate);
      order.creationDate = new Date(order.creationDate);

      // Save order to database and get reference
      const docRef = await createAndSaveOrder(order);

      agent.add(`Seu pedido foi confirmado e salvo com sucesso! \nO ID do pedido é ${docRef.id}.`);
      // Clear confirmation context
      agent.context.set({ name: contextName, lifespan: 0 });
      return;
    }

    // If user input doesn't match expected actions
    agent.add("Desculpe, não entendi sua escolha. Por favor, responda com: \n\n1. *Confirmar*\n2. *Editar*\n3. *Cancelar*");

    agent.context.set({
        name: contextName,
        lifespan: 5,
        parameters: {
          orderToConfirm: context.parameters.orderToConfirm
        }
      });

  } catch (error) {

    // Log error and notify user of failure
    console.error("Error while processing order confirmation flow:", error);
    agent.add("Desculpe, ocorreu um problema ao processar sua solicitação.");
    // Clear context to avoid stuck state
    agent.context.set({ name: contextName, lifespan: 0 });
  }
}


module.exports = {
  handleOrder,
  handleOrderConfirmation,
  handleCaptureQuantity,
  handleCaptureType,
  handleWantsMoreItems,
  handleDoneAddingItems,
  handleCaptureDay,
  handleCaptureMethod
};