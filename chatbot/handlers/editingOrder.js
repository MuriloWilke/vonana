const db = require('../firestore/firestore');

const { buildOrderConfirmationMessage } = require('../utils/messageUtils');

const { interpretFinalMethod } = require('../utils/paymentUtils')

const { validateMethodValue } = require('../utils/validationUtils');

const { validateDeliveryDayValue } = require('../utils/deliveryUtils');

/**
 * Handles the user's choice of what part of the order they want to edit.
 */
async function handleEditAction(agent) {
 
  const contextName = 'awaiting_order_edit'
  const dateContext = 'awaiting_order_edit_date';
  const methodContext = 'awaiting_order_edit_method';
  const itemContext = 'awaiting_order_edit_item';
  const addressContext = 'awaiting_order_edit_address';

  // Retrieve context containing the order data to edit
  const context = agent.getContext(contextName);
  
  // If no valid context/order found, inform user and clear context
  if (!context?.parameters?.orderToEdit) {
    agent.add("Desculpe. Não consegui localizar o pedido.");

    agent.setContext({
      name: contextName,
      lifespan: 0,
    });

    return;
  }

  // Parse the order object from context
  const order = JSON.parse(context.parameters.orderToEdit);

  // Retrieve user's chosen action to edit (e.g. date, items, payment method, address)
  const action = agent.parameters['editAction']

  // If no action was specified, prompt user to specify what to edit
  if (!action) {
    agent.add("Por favor, informe o que deseja alterar: \n- *Data de entrega*\n- *Itens*\n- *Método de Pagamento*\n- *Endereço*");
    
    agent.setContext({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order) }
    });
    
    return;
  }

  // Handle action based on user's choice
  if (action === 'Data') {
    
    agent.setContext({ name: contextName, lifespan: 0});

    // Set context to await new delivery date input
    agent.setContext({
      name: dateContext,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order) }
    });

    agent.add("Por favor, me diga se deseja para segunda, quinta ou sábado.");
  } 
  
  else if (action === 'Método') {

    agent.setContext({ name: contextName, lifespan: 0});

    // Set context to await new payment method input
    agent.setContext({
      name: methodContext,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order) }
    });

    agent.add("Escolha o método de pagamento\n1.Pix\n2.Crédito\n3.Débito\n4.Dinheiro");
  }
  
  else if (action === 'Item') {

    agent.setContext({ name: contextName, lifespan: 0});

    // Set context to await item editing choice
    agent.setContext({
      name: itemContext,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order) }
    });

     const lines = order.items.map((item, idx) => {
      return `${idx + 1} ${item.quantity} dúzias de ovos ${item.type}`;
    }).join('\n');
  
    agent.add(`Estes são os itens do seu pedido:\n\n${lines}\n\nPor favor, informe o número do item que deseja editar.`);
  } 

  else if (action === 'Endereço') {

    agent.setContext({ name: contextName, lifespan: 0});

    // Set context to await new address input
    agent.setContext({
      name: addressContext,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order) }
    });

    agent.add("Qual é o novo endereço?");
  }
  
  else {

    // If action doesn't match any known option, prompt user again
    agent.add("Ação inválida. Por favor, informe o que deseja alterar: \n- *Data de entrega*\n- *Itens*\n- *Método de Pagamento*\n- *Endereço*");
  
    agent.setContext({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order) }
    });
  }
}

/**
 * Handles updating the delivery date of an existing order.
 */
async function handleEditOrderChangeDate(agent) {

  const contextName = 'awaiting_order_edit_date';
  const confirmationContext = 'awaiting_order_confirmation';

  // Retrieve context containing the order data to edit
  const context = agent.getContext(contextName);

  // If no valid context is found, inform user and clear context
  if (!context?.parameters?.orderToEdit) {
    agent.add("Não consegui localizar o pedido para edição.");

    agent.setContext({
      name: contextName,
      lifespan: 0,
    });

    return;
  }

  // Parse the order object from context
  const order = JSON.parse(context.parameters.orderToEdit);
  
  // Retrieve the user-provided day value (expected to be a number representing weekday)
  const dayValue = Number(agent.parameters.dayValue); 

  // Validate that a numeric day value was provided
  if (typeof dayValue !== 'number') {
    agent.add("Por favor, me diga se deseja para segunda, quinta ou sábado.");
    return;
  }

  try {
    
    // Validate and calculate the new delivery date based on provided day
    const newDate = validateDeliveryDayValue(agent, dayValue);
    
    // Apply new delivery date to the order
    order.deliveryDate = newDate;

    agent.setContext({
      name: contextName,
      lifespan: 0,
    });

    // Set context to move into confirmation step with updated order
    agent.setContext({
      name: confirmationContext,
      lifespan: 5,
      parameters: {
        orderToConfirm: JSON.stringify(order)
      }
    });

    // Generate confirmation message and send it to user
    const confirmationMessage = buildOrderConfirmationMessage(order);
    agent.add(`Data de entrega atualizada com sucesso!\n`);
    agent.add(confirmationMessage);

  } catch (error) {

    // Handle invalid day values or processing errors
    console.error("Error while validating the newly edited delivery day:", error);

    // Keep editing context alive for user to retry
    agent.setContext({
      name: contextName,
      lifespan: 5,
      parameters: {
        orderToEdit: JSON.stringify(order)
      }
    });

    agent.add("Desculpe, o dia informado não é válido. Tente novamente com segunda, quinta ou sábado.");
  }
}

/**
 * Handles updating the payment method of an order.
 */
async function handleEditOrderChangePaymentMethod(agent) {
  
  const contextName = 'awaiting_order_edit_method';
  const confirmationContext = 'awaiting_order_confirmation';

  // Retrieve the context that holds the order to edit
  const context = agent.getContext(contextName);

  // If the context is missing or invalid, inform user and clear context
  if (!context?.parameters?.orderToEdit) {
    agent.add("Não consegui localizar o pedido para edição.");

    agent.setContext({
      name: contextName,
      lifespan: 0,
    });
    
    return;
  }

  // Parse the order data from context and retrieve payment method code from parameters
  const order = JSON.parse(context.parameters.orderToEdit);
  const methodCode = Number(agent.parameters['paymentMethod']);

  try {

    // Validate the provided payment method code
    const validMethod = validateMethodValue(agent, methodCode);

    // Convert the validated method code into its final string representation
    order.paymentMethod = interpretFinalMethod(validMethod);

    agent.setContext({
      name: contextName,
      lifespan: 0,
    });

    // Move to order confirmation after successful update
    agent.setContext({
      name: confirmationContext,
      lifespan: 5,
      parameters: { orderToConfirm: JSON.stringify(order) }
    });

    // Send confirmation message with updated order summary
    const confirmationMessage = buildOrderConfirmationMessage(order);
    agent.add(`Método de pagamento atualizado para: ${order.paymentMethod}.\n`);
    agent.add(confirmationMessage);

  } catch (error) {

    // Handle invalid method values or processing errors
    console.error("Error while validating the newly edited payment method:", error);

    // Keep context alive so user can retry
    agent.setContext({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order) }
    });

    agent.add("Por favor, informe um método de pagamento válido: 1. Pix, 2. Crédito, 3. Débito ou 4. Dinheiro.");
  }
}

/**
 * Handles updating the shipping address for both the order and the client profile.
 */
async function handleEditOrderChangeAddress(agent) {

  const contextName = 'awaiting_order_edit_address';
  const confirmationContext = 'awaiting_order_confirmation';

  // Retrieve the context that holds the order to edit
  const context = agent.getContext(contextName);

  // If the context is missing or invalid, inform user and clear context
  if (!context?.parameters?.orderToEdit) {
    agent.add("Não consegui localizar o pedido para edição.");

    agent.setContext({
      name: contextName,
      lifespan: 0,
    });

    return;
  }

  // Parse the order data from context and retrieve new address from parameters
  const order = JSON.parse(context.parameters.orderToEdit);
  const newAddress = agent.parameters['shippingAddress'];

  // Validate that a proper address object was provided
  if (!newAddress || typeof newAddress !== 'object') {
    agent.add("Por favor, forneça um novo endereço válido.");

    // Keep context alive so user can retry
    agent.setContext({
      name: contextName,
      lifespan: 5,
      parameters: { orderToConfirm: JSON.stringify(order) }
    });

    return;
  }

  try {
    
    // Update the order's shipping address locally
    order.shippingAddress = newAddress;

    // Retrieve clientId from order and update client document in Firestore
    const clientId = order.clientId;
    const clientDoc = db.collection('clients').doc(clientId);

    await clientDoc.update({
      shippingAddress: newAddress
    });

    agent.setContext({
      name: contextName,
      lifespan: 0,
    });

    // Move to order confirmation after successful update
    agent.setContext({
      name: confirmationContext,
      lifespan: 5,
      parameters: { orderToConfirm: JSON.stringify(order) }
    });

    // Send confirmation message with updated order summary
    const confirmationMessage = buildOrderConfirmationMessage(order);
    agent.add("Endereço atualizado com sucesso!\n");
    agent.add(confirmationMessage);

  } catch (error) {

    // Handle potential Firestore or processing errors
    console.error("Error while updating the address:", error);

    // Keep context alive so user can retry
    agent.setContext({
      name: contextName,
      lifespan: 0,
    });

    agent.add("Desculpe, ocorreu um erro ao atualizar o endereço. Por favor, tente novamente.");
  }

}

/**
 * Handles the user selection of which item they want to edit from the order.
 * 
 * If no index is provided, it lists all available items and asks for selection.
 * If index is provided and valid, it forwards to the item action handler.
 */
async function handleChooseItemToEdit(agent) {

  const contextName = 'awaiting_order_edit_item';
  const itemActionContext = 'awaiting_order_item_action';

  // Retrieve context where the full order is stored
  const context = agent.getContext(contextName);
  
  // If no order found in context, inform the user and clear context
  if (!context?.parameters?.orderToEdit) {
    agent.add("Não consegui localizar o pedido para edição.");

    agent.setContext({
      name: contextName,
      lifespan: 0,
    });

    return;
  }

  // Parse the stored order and extract the index provided by user
  const order = JSON.parse(context.parameters.orderToEdit);
  const selectedIndex = agent.parameters['itemIndex'];

  // Build the list of items for display
  const lines = order.items.map((item, idx) => {
    return `${idx + 1} ${item.quantity} dúzias de ovos ${item.type}`;
  }).join('\n');

  // If no index provided, show the list and ask user to pick one
  if (selectedIndex === undefined || selectedIndex === null) {
    agent.add(`Estes são os itens do seu pedido:\n\n${lines}\n\nPor favor, informe o número do item que deseja editar.`);
    
    agent.setContext({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order) }
    });

    return;
  }

  // Validate that the index is a valid number and within range
  if (
    typeof selectedIndex !== 'number' ||
    selectedIndex < 1 ||
    selectedIndex > order.items.length
  ) {
    agent.add(`Número inválido. Por favor, escolha um número da lista:\n\n${lines}`);

    agent.setContext({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order) }
    });

    return;
  }

  // Adjust to zero-based index
  const itemIndex = selectedIndex - 1;

  agent.setContext({
      name: contextName,
      lifespan: 0,
    });

  // Set context to await which action will be performed on the selected item
  agent.setContext({
    name: itemActionContext,
    lifespan: 5,
    parameters: {
      orderToEdit: JSON.stringify(order),
      editingItemIndex: itemIndex
    }
  });

  // Confirm selection to the user
  const item = order.items[itemIndex];
  agent.add(`Você escolheu o item ${selectedIndex}: ${item.quantity} dúzias de ovos ${item.type}.\nDeseja alterar a *Quantidade*, o *Tipo* ou *Excluir* este item?`);
}

/**
 * Handles user actions for editing a specific item in the order.
 * 
 * Depending on the user's chosen action (change quantity, change type, or delete the item),
 * it redirects the conversation to the appropriate handler or modifies the order directly.
 */
async function handleOrderItemAction(agent) {
  
  const contextName = 'awaiting_order_item_action';
  const itemQuantityContext = 'awaiting_item_quantity';
  const itemTypeContext = 'awaiting_item_type';
  const confirmationContext = 'awaiting_order_confirmation';

  // Retrieve the current context where the item being edited is stored
  const context = agent.getContext(contextName);
  
  // Validate that both the order and the item index are present in the context
  if (!context?.parameters?.orderToEdit || context?.parameters?.editingItemIndex === undefined) {
    agent.add("Não consegui localizar o item para editar.");

    // Clear context if information is missing to avoid confusion in conversation flow
    agent.setContext({
      name: contextName,
      lifespan: 0,
    });
    
    return;
  }

  // Deserialize the order object and retrieve the item index
  const order = JSON.parse(context.parameters.orderToEdit);
  const itemIndex = context.parameters.editingItemIndex;

  // Get the user's selected action
  const action = agent.parameters['itemAction'];

  // If no action was provided, ask the user again
  if (!action) {
    agent.add("Por favor, informe se deseja alterar a *Quantidade*, o *Tipo* ou *Excluir* o item.");
    
    agent.setContext({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order), editingItemIndex: itemIndex }
    });
    
    
    return;
  }

  // Handle "Quantidade" action: set context to await new quantity
  if (action === 'Quantidade') {

    agent.setContext({
      name: contextName,
      lifespan: 0,
    });

    agent.setContext({
      name: itemQuantityContext,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order), editingItemIndex: itemIndex }
    });

    agent.add("Qual é a nova quantidade de dúzias para este item?");
  } 
  
  // Handle "Tipo" action: set context to await new type
  else if (action === 'Tipo') {

    agent.setContext({
      name: contextName,
      lifespan: 0,
    });

    agent.setContext({
      name: itemTypeContext,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order), editingItemIndex: itemIndex }
    });

    agent.add("Qual é o novo tipo de ovo? (extra ou jumbo)");
  } 
  
  // Handle "Excluir" action: remove item from list, return to confirmation
  else if (action === 'Excluir') {
    order.items.splice(itemIndex, 1); // Remove the item from the array

    try {
      const configDocRef = db.collection('configurations').doc('1');
      const configDoc = await configDocRef.get();

      if (!configDoc.exists) {
        agent.add('Desculpe, problema ao obter configurações. Tente novamente mais tarde.');
        throw new Error('Failed to load configuration.');
      }

      const { extraValue, jumboValue, freeShipping, shippingValue } = configDoc.data();

      // Recalcula subtotal e total com os itens restantes
      let subtotal = 0;
      let dozenCount = 0;

      order.items = order.items.map(item => {
        const unitPrice = item.type.toLowerCase() === 'extra' ? extraValue : jumboValue;
        const itemValue = unitPrice * item.quantity;
        subtotal += itemValue;
        dozenCount += item.quantity;
        return { ...item, itemValue };
      });

      let shipping = 0;
      if (subtotal >= freeShipping) {
        shipping = 0;
      } else {
        shipping = shippingValue;
      }

      order.subtotal = subtotal;
      order.shipping = shipping;
      order.total = subtotal + shipping;

    } catch (error) {
      console.error("Error while recalculating value after exclusion: ", error);
      agent.setContext({ name: contextName, lifespan: 0 });
      agent.add(`Houve um problema ao atualizar o pedido após a exclusão. Refaça o Pedido.`);
      return;
    }

    agent.setContext({
      name: contextName,
      lifespan: 0,
    });

    agent.setContext({
      name: confirmationContext,
      lifespan: 5,
      parameters: { orderToConfirm: JSON.stringify(order) }
    });

    // Build updated order summary message
    const confirmationMessage = buildOrderConfirmationMessage(order);
    
    // Inform user that the quantity was successfully updated
    agent.add(`Item removido com sucesso.\n`);
    agent.add(confirmationMessage);
  } 
  
  // If action is invalid, prompt user again
  else {
    agent.add("Ação inválida. Por favor, diga se deseja alterar a *Quantidade*, o *Tipo* ou *Excluir* o item.");
  
    agent.setContext({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order), editingItemIndex: itemIndex }
    });
  }
}

// Async handler to update the quantity of dozens for a specific item in the order
async function handleEditItemQuantity(agent) {
  
  const contextName = 'awaiting_item_quantity';
  const confirmationContext = 'awaiting_order_confirmation';

  // Retrieve the context where the order data and item index are stored
  const context = agent.getContext(contextName);
  
  // Validate if the context exists and has necessary parameters
  if (!context?.parameters?.orderToEdit || context?.parameters?.editingItemIndex === undefined) {
    // If context is missing or corrupted, inform the user
    agent.add("Não consegui localizar o item para atualizar a quantidade.");
    
    // Clean the context to prevent getting stuck in this state
    agent.setContext({
      name: contextName,
      lifespan: 0,
    });
    
    return;
  }

  // Parse the order object from JSON string
  const order = JSON.parse(context.parameters.orderToEdit);
  const itemIndex = context.parameters.editingItemIndex;

  // Get the new quantity from the user's input
  const newQuantity = agent.parameters['dozenQuantity'];
  
  // Validate that the quantity is a positive integer
  if (typeof newQuantity !== 'number' || newQuantity <= 0 || !Number.isInteger(newQuantity)) {
    
    // If invalid, inform the user and prompt again
    agent.add("Por favor, informe uma quantidade válida (número inteiro positivo de dúzias).");
    
    // Reset the same context to keep the state and allow retry
    agent.setContext({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order), editingItemIndex: itemIndex }
    });

    return;
  }

  try {

    // Retrieve clientId from order and update client document in Firestore
    const configDocRef = db.collection('configurations').doc('1');
    const configDoc = await configDocRef.get();

    if (!configDoc.exists) {
      agent.add('Desculpe, problema ao obter configurações. Tente novamente mais tarde.');
      throw new Error('Failed to load configuration.');
    }

    const { extraValue, jumboValue, freeShipping, shippingValue } = configDoc.data();

    order.items[itemIndex].quantity = newQuantity;

    // Recalculate the subtotal and the value for each item
    let subtotal = 0;
    let dozenCount = 0;

    order.items = order.items.map(item => {
      const unitPrice = item.type.toLowerCase() === 'extra' ? extraValue : jumboValue;
      const itemValue = unitPrice * item.quantity;
      subtotal += itemValue;
      dozenCount += item.quantity;
      return { ...item, itemValue };
    });

    // Calculate the shipping value
    let shipping = 0;
    if (subtotal >= freeShipping) {
      shipping = 0;
    } else {
      shipping = shippingValue;
    }

    // Update the total value's order
    order.subtotal = subtotal;
    order.shipping = shipping;
    order.total = subtotal + shipping;

  } catch (error) {
    console.error("Error while recalculating the values: ", error);
    agent.setContext({ name: contextName, lifespan: 0 });
    agent.add(`Houve um problema ao atualizar a quantidade. Refaça o Pedido.`);
    return;
  }

  agent.setContext({
      name: contextName,
      lifespan: 0,
  });

  // Move user back to the order confirmation flow after updating
  agent.setContext({
    name: confirmationContext,
    lifespan: 5,
    parameters: { orderToConfirm: JSON.stringify(order) }
  });

  // Build updated order summary message
  const confirmationMessage = buildOrderConfirmationMessage(order);
  
  // Inform user that the quantity was successfully updated
  agent.add(`Quantidade atualizada para ${newQuantity} dúzias.\n`);
  agent.add(confirmationMessage);
}

// Async handler for updating the egg type of a specific item in the order
async function handleEditItemType(agent) {

  const contextName = 'awaiting_item_type';
  const confirmationContext = 'awaiting_order_confirmation';

  // Retrieve the context where the order data and item index are stored
  const context = agent.getContext(contextName);
  
  // Check if the context exists and has valid data
  if (!context?.parameters?.orderToEdit || context?.parameters?.editingItemIndex === undefined) {
    // If not, inform the user that the item couldn't be found
    agent.add("Não consegui localizar o item para atualizar o tipo.");

    // Clear the context to avoid further confusion
    agent.setContext({
      name: contextName,
      lifespan: 0,
    });

    return;
  }

  // Parse the order object from JSON
  const order = JSON.parse(context.parameters.orderToEdit);
  const itemIndex = context.parameters.editingItemIndex;

  // Retrieve the new egg type provided by the user
  const newType = agent.parameters['eggType'];

  // Define the allowed egg types
  const validTypes = ['extra', 'jumbo'];

  // Validate if user provided a valid egg type
  if (!newType || !validTypes.includes(newType.toLowerCase())) {
    // If invalid, ask again for a valid input
    agent.add("Por favor, informe um tipo de ovo válido: *extra* ou *jumbo*.");
    
    // Re-set the same context to keep order state and retry
    agent.setContext({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: JSON.stringify(order), editingItemIndex: itemIndex }
    });
    
    return;
  }

  try {
    // Update the egg type
    order.items[itemIndex].type = newType;

    // Retrieve the configurations from firestore
    const configDocRef = db.collection('configurations').doc('1');
    const configDoc = await configDocRef.get();

    if (!configDoc.exists) {
      agent.add('Desculpe, problema ao obter configurações. Tente novamente mais tarde.');
      throw new Error('Failed to load configuration.');
    }

    const { extraValue, jumboValue, freeShipping, shippingValue } = configDoc.data();

    // Recalculate subtotal and total
    let subtotal = 0;
    let dozenCount = 0;

    order.items = order.items.map(item => {
      const unitPrice = item.type.toLowerCase() === 'extra' ? extraValue : jumboValue;
      const itemValue = unitPrice * item.quantity;
      subtotal += itemValue;
      dozenCount += item.quantity;
      return { ...item, itemValue };
    });

    let shipping = 0;
    if (subtotal >= freeShipping) {
      shipping = 0;
    } else {
      shipping = shippingValue;
    }

    order.subtotal = subtotal;
    order.shipping = shipping;
    order.total = subtotal + shipping;

  } catch (error) {
    console.error("Error while recalculating values: ", error);
    agent.setContext({ name: contextName, lifespan: 0 });
    agent.add(`Houve um problema ao atualizar o tipo. Refaça o Pedido.`);
    return;
  }

  agent.setContext({
      name: contextName,
      lifespan: 0,
    });

  // After updating, move the flow back to order confirmation context
  agent.setContext({
    name: confirmationContext,
    lifespan: 5,
    parameters: { orderToConfirm: JSON.stringify(order) }
  });

  // Build a new confirmation message based on updated order
  const confirmationMessage = buildOrderConfirmationMessage(order);
  
  // Inform the user that the egg type was updated and show full updated order
  agent.add(`Tipo de ovo atualizado para ${newType}\n`);
  agent.add(confirmationMessage);
}

module.exports = {
  handleEditAction,
  handleEditOrderChangeDate,
  handleEditOrderChangePaymentMethod,
  handleEditOrderChangeAddress,
  handleChooseItemToEdit,
  handleOrderItemAction,
  handleEditItemQuantity,
  handleEditItemType,
};