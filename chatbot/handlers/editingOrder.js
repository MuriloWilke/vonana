const db = require('../firestore/firestore');

const { interpretFinalMethod } = require('../utils/paymentUtils')
const { validateMethodValue } = require('../utils/validationUtils');
const { validateDeliveryDayValue } = require('../utils/deliveryUtils');
const { buildOrderConfirmationMessage } = require('../utils/messageUtils');
const { getAddressFromCEP } = require('../services/cepService');
const { ensureClientExistsAndAddressSaved } = require('../services/clientService');
const { hasNumberInAddress } = require('../utils/addressUtils');

const NUMBER_EDIT_CONTEXT = 'awaiting_address_number_edit';
const CONFIRMATION_CONTEXT = 'awaiting_order_confirmation';
const COMPLETION_EDIT_CONTEXT = 'awaiting_address_completion_edit';

/**
 * Handles the user's choice of what part of the order they want to edit.
 */
async function handleEditAction(agent) {
 
  const contextName = 'awaiting_order_edit'
  const dateContext = 'awaiting_order_edit_date';
  const methodContext = 'awaiting_order_edit_method';
  const itemContext = 'awaiting_order_edit_item';
  const addressContext = 'awaiting_order_edit_address';
  const itemActionContext = 'awaiting_order_item_action';

  // Retrieve context containing the order data to edit
  const context = agent.context.get(contextName);
  
  // If no valid context/order found, inform user and clear context
  if (!context?.parameters?.orderToEdit) {
    agent.add("Desculpe. Não consegui localizar o pedido.");

    agent.context.set({
      name: contextName,
      lifespan: 0,
    });

    return;
  }

  // Parse the order object from context
  const order = context.parameters.orderToEdit;

  // Retrieve user's chosen action to edit (e.g. date, items, payment method, address)
  const action = agent.parameters['editAction']

  // If no action was specified, prompt user to specify what to edit
  if (!action) {
    agent.add("Por favor, informe o que deseja alterar: \n1. *Data de entrega*\n2. *Itens*\n3. *Método de Pagamento*\n4. *Endereço*\n5. *Cancelar Edição*");
    
    agent.context.set({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: order }
    });
    
    return;
  }

  // Handle action based on user's choice
  if (action === 'Data') {
    
    agent.context.set({ name: contextName, lifespan: 0});

    // Set context to await new delivery date input
    agent.context.set({
      name: dateContext,
      lifespan: 5,
      parameters: { orderToEdit: order }
    });

    agent.add("Por favor, me diga se deseja para:\n\n1. *Segunda*\n2. *Quinta*");
  } 
  
  else if (action === 'Método') {

    agent.context.set({ name: contextName, lifespan: 0});

    // Set context to await new payment method input
    agent.context.set({
      name: methodContext,
      lifespan: 5,
      parameters: { orderToEdit: order }
    });

    agent.add("Escolha o método de pagamento\n\n1. *Pix*\n2. *Crédito*\n3. *Débito*\n4. *Dinheiro*");
  }
  
  else if (action === 'Item') {

    agent.context.set({ name: contextName, lifespan: 0});

    if (order.items.length === 1) {
        const itemIndex = 0;
        const item = order.items[itemIndex];
        
        agent.context.set({
          name: itemActionContext,
          lifespan: 5,
          parameters: {
            orderToEdit: order,
            editingItemIndex: itemIndex
          }
        });

        agent.add(`Você tem apenas um item no pedido: *Item 1* (${item.quantity} dúzias de ovos ${item.type}).\n\nDeseja alterar:\n\n1. *Quantidade*\n2. *Tipo*\n3. *Excluir*`);
    
    } else {

      // Set context to await item editing choice
      agent.context.set({
        name: itemContext,
        lifespan: 5,
        parameters: { orderToEdit: order }
      });

      const lines = order.items.map((item, idx) => {
        return `*Item ${idx + 1}*: (${item.quantity} dúzias de ovos ${item.type})`;
      }).join('\n');
    
      agent.add(`Por favor, informe o número do item que deseja editar:\n\n${lines}`);
    }
  } 

  else if (action === 'Endereço') {

    agent.context.set({ name: contextName, lifespan: 0});

    // Set context to await new address input
    agent.context.set({
      name: addressContext,
      lifespan: 5,
      parameters: { orderToEdit: order }
    });

    agent.add("Informe o novo CEP ou o endereço.");
  }

  else if (action === 'Cancelar') {
    agent.add("Edição cancelada. Voltando para a confirmação do pedido...");
    agent.context.set({ name: contextName, lifespan: 0 });
    agent.context.set({
      name: CONFIRMATION_CONTEXT,
      lifespan: 5,
      parameters: { orderToConfirm: order }
    });
    const confirmationMessage = buildOrderConfirmationMessage(order);
    agent.add(confirmationMessage);
  }
  
  else {

    // If action doesn't match any known option, prompt user again
    agent.add("Ação inválida. Por favor, informe o que deseja alterar: \n\n1. *Data de entrega*\n2. *Itens*\n3. *Método de Pagamento*\n4. *Endereço*\n5. *Cancelar Edição*");
  
    agent.context.set({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: order }
    });
  }
}

/**
 * Handles updating the delivery date of an existing order.
 */
async function handleEditOrderChangeDate(agent) {

  const contextName = 'awaiting_order_edit_date';

  // Retrieve context containing the order data to edit
  const context = agent.context.get(contextName);

  // If no valid context is found, inform user and clear context
  if (!context?.parameters?.orderToEdit) {
    agent.add("Não consegui localizar o pedido para edição.");

    agent.context.set({
      name: contextName,
      lifespan: 0,
    });

    return;
  }

  // Parse the order object from context
  const order = context.parameters.orderToEdit;
  
  // Retrieve the user-provided day value (expected to be a number representing weekday)
  const dayValue = Number(agent.parameters.deliveryDate); 

  // Validate that a numeric day value was provided
  if (typeof dayValue !== 'number') {
    agent.add("Por favor, me diga qual será o dia para entrega:\n\n1. *Segunda*\n2. *Quinta*");
    return;
  }

  try {
    
    // Validate and calculate the new delivery date based on provided day
    const newDate = validateDeliveryDayValue(agent, dayValue);
    
    // Apply new delivery date to the order
    order.deliveryDate = newDate;

    agent.context.set({
      name: contextName,
      lifespan: 0,
    });

    // Set context to move into confirmation step with updated order
    agent.context.set({
      name: CONFIRMATION_CONTEXT,
      lifespan: 5,
      parameters: { orderToConfirm: order}
    });

    const confirmationMessage = buildOrderConfirmationMessage(order);
    agent.add(confirmationMessage);

  } catch (error) {

    // Handle invalid day values or processing errors
    console.error("Error while validating the newly edited delivery day:", error);

    // Keep editing context alive for user to retry
    agent.context.set({
      name: contextName,
      lifespan: 5,
      parameters: {
        orderToEdit: order
      }
    });

    agent.add("Desculpe, o dia informado não é válido. Tente novamente\n\n1. *Segunda*\n2. *Quinta*");
  }
}

/**
 * Handles updating the payment method of an order.
 */
async function handleEditOrderChangePaymentMethod(agent) {
  
  const contextName = 'awaiting_order_edit_method';

  // Retrieve the context that holds the order to edit
  const context = agent.context.get(contextName);

  // If the context is missing or invalid, inform user and clear context
  if (!context?.parameters?.orderToEdit) {
    agent.add("Não consegui localizar o pedido para edição.");

    agent.context.set({
      name: contextName,
      lifespan: 0,
    });
    
    return;
  }

  // Parse the order data from context and retrieve payment method code from parameters
  const order = context.parameters.orderToEdit;
  const methodCode = Number(agent.parameters['paymentMethod']);

  try {

    // Validate the provided payment method code
    const validMethod = validateMethodValue(agent, methodCode);

    // Convert the validated method code into its final string representation
    order.paymentMethod = interpretFinalMethod(validMethod);

    agent.context.set({
      name: contextName,
      lifespan: 0,
    });

    // Move to order confirmation after successful update
    agent.context.set({
      name: CONFIRMATION_CONTEXT,
      lifespan: 5,
      parameters: { orderToConfirm: order }
    });

    const confirmationMessage = buildOrderConfirmationMessage(order);
    agent.add(confirmationMessage);

  } catch (error) {

    // Handle invalid method values or processing errors
    console.error("Error while validating the newly edited payment method:", error);

    // Keep context alive so user can retry
    agent.context.set({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: order }
    });

    agent.add("Por favor, informe um método de pagamento válido: \n\n1. *Pix*\n2. *Crédito*\n3. *Débito*\n4. *Dinheiro*.");
  }
}

/**
 * Handles updating the shipping address for both the order and the client profile.
 */
async function handleEditOrderChangeAddress(agent) {

  const contextName = 'awaiting_order_edit_address';
  let order;

  try {
    // Retrieve the context that holds the order to edit
    const context = agent.context.get(contextName);

    // If the context is missing or invalid, inform user and clear context
    if (!context?.parameters?.orderToEdit) {
      agent.add("Não consegui localizar o pedido para edição.");

      agent.context.set({
        name: contextName,
        lifespan: 0,
      });

      return;
    }

    // Parse the order data from context and retrieve new address or cep from parameters
    order = context.parameters.orderToEdit;
    const newAddress = agent.parameters['shippingAddress'];
    const providedNumber = agent.parameters.addressNumber;
    let finalAddress;

    console.log("--- handleEditOrderChangeAddress ---");
    console.log("Received Parameters:", JSON.stringify(agent.parameters, null, 2));
    console.log("Parsed shippingAddress:", newAddress);
    console.log("Parsed addressNumber:", providedNumber);
  
    if (newAddress && typeof newAddress === 'object' && (newAddress['admin-area'] || newAddress['street-address'])) {
        finalAddress = newAddress;
    } 
    
    else if (newAddress && typeof newAddress === 'object' && newAddress['zip-code'] && !newAddress['street-address']) {
        const cepFromAddress = newAddress['zip-code'].replace(/\D/g, '');
        console.log(`Detected zip-code inside address object: ${cepFromAddress}. Fetching from ViaCEP...`);
        finalAddress = await getAddressFromCEP(cepFromAddress);
    } 
    
    else {
      agent.add("Por favor, forneça um endereço válido ou um CEP.");
      agent.context.set({
        name: contextName,
        lifespan: 5,
        parameters: { orderToEdit: order }
      });
      return;
    }

    const clientId = order.clientId;
    
    const hasState = finalAddress['admin-area'] && finalAddress['admin-area'].length > 0;
    const hasCity = finalAddress.city && finalAddress.city.length > 0;
    const hasStreet = finalAddress['street-address'] && finalAddress['street-address'].length > 0;

    if (hasState && hasCity && hasStreet) {
      console.log("Endereço completo, validando e checando número.");
      
      await ensureClientExistsAndAddressSaved(db, clientId, finalAddress);

      if (providedNumber) {
        finalAddress['street-address'] += `, ${providedNumber}`;
        order.shippingAddress = finalAddress;
        await db.collection('clients').doc(clientId).update({ shippingAddress: finalAddress });

        agent.context.set({ name: contextName, lifespan: 0 });
        agent.context.set({ name: CONFIRMATION_CONTEXT, lifespan: 5, parameters: { orderToConfirm: order } });
        const confirmationMessage = buildOrderConfirmationMessage(order);
        agent.add(confirmationMessage);

      } 
      
      else if (hasNumberInAddress(finalAddress['street-address'])) {
        order.shippingAddress = finalAddress;
        await db.collection('clients').doc(clientId).update({ shippingAddress: finalAddress });

        agent.context.set({ name: contextName, lifespan: 0 });
        agent.context.set({ name: CONFIRMATION_CONTEXT, lifespan: 5, parameters: { orderToConfirm: order } });
        const confirmationMessage = buildOrderConfirmationMessage(order);
        agent.add(confirmationMessage);

      } 
      
      else {
        agent.add("Entendi o endereço. Para finalizar, qual é o novo número da casa ou apartamento?");
        agent.context.set({
          name: NUMBER_EDIT_CONTEXT,
          lifespan: 2,
          parameters: { orderToEdit: order, newAddressBase: finalAddress }
        });
        agent.context.set({ name: contextName, lifespan: 0 });
      }
    } else {
      console.log("Endereço incompleto. Iniciando fluxo de conclusão.");
      
      agent.context.set({
        name: COMPLETION_EDIT_CONTEXT,
        lifespan: 5,
        parameters: {
          orderToEdit: order,
          partialAddress: finalAddress
        }
      });
      agent.context.set({ name: contextName, lifespan: 0 });

      if (!hasState) {
        agent.add("Para continuar, qual é o Estado? Você também pode informar o CEP, se preferir.");
      } 
      
      else if (!hasCity) {
        agent.add("Ok. Agora, qual é a Cidade? Ou, se preferir, o CEP.");
      }
      
      else if (!hasStreet) {
        agent.add("Quase lá. Qual é a Rua e o número? Ou, se preferir, o CEP.");
      }
    }

  } catch (error) {

    // Handle potential Firestore or processing errors
    console.error("Error while updating the address:", error);
    let userMessage;

    if (error.message.includes("Endereço incompleto") || error.message.includes("Endereço inválido")) {
      userMessage = `${error.message}. Por favor, informe o endereço completo novamente.`;
    } 
    else if (error.message.includes("CEP")) {
      userMessage = `${error.message}. Por favor, tente novamente com outro CEP ou digite o endereço.`;
    }
    else {
      userMessage = `Tivemos um problema. Tente Novamente`;
    }

    agent.add(userMessage);
    
    // Keep context alive so user can retry
    agent.context.set({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: order }
    });
  }

}

async function handleAddressCompletionEdit(agent) {
  const contextName = COMPLETION_EDIT_CONTEXT;
  const context = agent.context.get(contextName);

  if (!context?.parameters?.orderToEdit || !context.parameters.partialAddress) {
    agent.add("Desculpe, perdi os dados da edição. Por favor, comece a editar novamente.");
    agent.context.set({ name: contextName, lifespan: 0 });
    return;
  }

  const order = context.parameters.orderToEdit;
  let partialAddress = context.parameters.partialAddress;
  
  const newInfo = agent.parameters['shippingAddress']; 
  let mergedAddress = { ...partialAddress };

  try {
    if (newInfo && typeof newInfo === 'object' && newInfo['zip-code'] && !newInfo['street-address']) {
      const cepFromAddress = newInfo['zip-code'].replace(/\D/g, '');
      console.log(`Recebido CEP durante preenchimento: ${cepFromAddress}. Buscando...`);
      const cepAddress = await getAddressFromCEP(cepFromAddress);

      const originalStreet = partialAddress['street-address'];
      mergedAddress = { ...partialAddress, ...cepAddress };

      if (originalStreet && originalStreet.length > (cepAddress['street-address'] || '').length) {
        mergedAddress['street-address'] = originalStreet;
      }
      
      console.log("Endereço (CEP + Parcial) fundido:", mergedAddress);
    } 
    
    else if (newInfo && typeof newInfo === 'object') {
      if (newInfo.island && !newInfo.city) {
        if (newInfo.island.toLowerCase().includes('santa maria')) {
            newInfo.city = 'Santa Maria';
            console.log("Workaround: 'island' corrigido para 'city'");
        }
      }

      const filteredNewInfo = {};
      for (const key in newInfo) {
        if (newInfo[key] && newInfo[key].length > 0) {
          filteredNewInfo[key] = newInfo[key];
        }
      }
      mergedAddress = { ...partialAddress, ...filteredNewInfo };
      console.log("Endereço (Texto + Parcial) fundido:", mergedAddress);
    } 
    
    else {
      agent.add("Não entendi. Por favor, me diga o Estado, a cidade ou o CEP.");
      agent.context.set({ name: contextName, lifespan: 2, parameters: context.parameters });
      return;
    }

    const hasState = mergedAddress['admin-area'] && mergedAddress['admin-area'].length > 0;
    const hasCity = mergedAddress.city && mergedAddress.city.length > 0;
    const hasStreet = mergedAddress['street-address'] && mergedAddress['street-address'].length > 0;

    if (hasState && hasCity && hasStreet) {
      console.log("Endereço completo. Salvando e checando número.");
      
      await ensureClientExistsAndAddressSaved(db, order.clientId, mergedAddress);
      
      agent.context.set({ name: contextName, lifespan: 0 });

      if (hasNumberInAddress(mergedAddress['street-address'])) {
        order.shippingAddress = mergedAddress;
        await db.collection('clients').doc(order.clientId).update({ shippingAddress: mergedAddress });

        agent.context.set({ name: CONFIRMATION_CONTEXT, lifespan: 5, parameters: { orderToConfirm: order } });
        const confirmationMessage = buildOrderConfirmationMessage(order);
        agent.add(confirmationMessage);
      } else {
        agent.add("Endereço completo! Para finalizar, qual é o novo número da casa ou apartamento?");
        agent.context.set({
          name: NUMBER_EDIT_CONTEXT,
          lifespan: 2,
          parameters: { orderToEdit: order, newAddressBase: mergedAddress }
        });
      }

    } else {
      agent.context.set({
        name: contextName,
        lifespan: 5,
        parameters: { orderToEdit: order, partialAddress: mergedAddress }
      });

      if (!hasState) {
        agent.add("Certo. Qual é o Estado? Ou o CEP.");
      } 
      
      else if (!hasCity) {
        agent.add("Informe a Cidade. ou o CEP, se preferir");
      } 
      
      else if (!hasStreet) {
        agent.add("Perfeito. Agora só falta a Rua e o número.");
      }
    }

  } catch (error) {
    console.error("Error in handleAddressCompletionEdit:", error);
    agent.add(`Tivemos um problema: ${error.message}. Vamos tentar de novo. Por favor, informe o estado, cidade ou CEP.`);
    agent.context.set({ name: contextName, lifespan: 2, parameters: context.parameters });
  }
}

async function handleCaptureEditAddressNumber(agent) {
  const contextName = 'awaiting_address_number_edit';
  
  try {
    const number = agent.parameters.addressNumber;
    const context = agent.context.get(contextName);

    if (!context || !context.parameters.orderToEdit || !context.parameters.newAddressBase) {
      agent.add("Desculpe, perdi os dados da edição. Por favor, comece a editar novamente.");
      agent.context.set({ name: contextName, lifespan: 0 });
      return;
    }

    if (!number) {
      agent.add("Não entendi. Por favor, diga apenas o número (ex: 123, 45b, apto 101).");
      agent.context.set({ name: contextName, lifespan: 2, parameters: context.parameters });
      return;
    }

    let order = context.parameters.orderToEdit;
    let finalAddress = context.parameters.newAddressBase;
    
    finalAddress['street-address'] += `, ${number}`;
    order.shippingAddress = finalAddress;

    const clientId = order.clientId;
    await db.collection('clients').doc(clientId).update({ shippingAddress: finalAddress });

    agent.context.set({ name: contextName, lifespan: 0 });
    agent.context.set({
      name: CONFIRMATION_CONTEXT,
      lifespan: 5,
      parameters: { orderToConfirm: order }
    });
    const confirmationMessage = buildOrderConfirmationMessage(order);
    agent.add(confirmationMessage);

  } catch (error) {
    console.error("Error in handleCaptureEditAddressNumber:", error);
    agent.add("Desculpe, tivemos um problema ao salvar o número. Por favor, tente novamente.");
    agent.context.set({ name: contextName, lifespan: 0 });
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
  const context = agent.context.get(contextName);
  
  // If no order found in context, inform the user and clear context
  if (!context?.parameters?.orderToEdit) {
    agent.add("Não consegui localizar o pedido para edição.");

    agent.context.set({
      name: contextName,
      lifespan: 0,
    });

    return;
  }

  // Parse the stored order and extract the index provided by user
  const order = context.parameters.orderToEdit;

  const selectedIndex = agent.parameters['itemIndex'];

  // Build the list of items for display
  const lines = order.items.map((item, idx) => {
    return `*Item ${idx + 1}*: (${item.quantity} dúzias de ovos ${item.type})`;
  }).join('\n');

  // If no index provided, show the list and ask user to pick one
  if (selectedIndex === undefined || selectedIndex === null) {
    agent.add(`Por favor escolha o número do item que deseja alterar:\n\n${lines}`);
    
    agent.context.set({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: order }
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

    agent.context.set({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: order }
    });

    return;
  }

  // Adjust to zero-based index
  const itemIndex = selectedIndex - 1;

  agent.context.set({
      name: contextName,
      lifespan: 0,
    });

  // Set context to await which action will be performed on the selected item
  agent.context.set({
    name: itemActionContext,
    lifespan: 5,
    parameters: {
      orderToEdit: order,
      editingItemIndex: itemIndex
    }
  });

  // Confirm selection to the user
  const item = order.items[itemIndex];
  agent.add(`Você escolheu o *item ${selectedIndex}*: (${item.quantity} dúzias de ovos ${item.type}).\n\nDeseja alterar:\n\n1. *Quantidade*\n2. *Tipo*\n3. *Excluir*`);
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

  // Retrieve the current context where the item being edited is stored
  const context = agent.context.get(contextName);
  
  // Validate that both the order and the item index are present in the context
  if (!context?.parameters?.orderToEdit || context?.parameters?.editingItemIndex === undefined) {
    agent.add("Não consegui localizar o item para editar.");

    // Clear context if information is missing to avoid confusion in conversation flow
    agent.context.set({
      name: contextName,
      lifespan: 0,
    });
    
    return;
  }

  // Deserialize the order object and retrieve the item index
  const order = context.parameters.orderToEdit;
  const itemIndex = context.parameters.editingItemIndex;

  // Get the user's selected action
  const action = agent.parameters['itemAction'];

  const promptMessage = "Deseja alterar:\n\n1. *Quantidade*\n2. *Tipo*\n3. *Excluir*";

  // If no action was provided, ask the user again
  if (!action) {
    agent.add(`Por favor, informe se deseja alterar:\n\n${promptMessage}`);
    
    agent.context.set({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: order, editingItemIndex: itemIndex }
    });
    
    
    return;
  }

  // Handle "Quantidade" action: set context to await new quantity
  if (action === 'Quantidade') {

    agent.context.set({
      name: contextName,
      lifespan: 0,
    });

    agent.context.set({
      name: itemQuantityContext,
      lifespan: 5,
      parameters: { orderToEdit: order, editingItemIndex: itemIndex }
    });

    agent.add("Qual é a nova quantidade de dúzias para este item?");
  } 
  
  // Handle "Tipo" action: set context to await new type
  else if (action === 'Tipo') {

    agent.context.set({
      name: contextName,
      lifespan: 0,
    });

    agent.context.set({
      name: itemTypeContext,
      lifespan: 5,
      parameters: { orderToEdit: order, editingItemIndex: itemIndex }
    });

    agent.add("Qual é o novo tipo de ovo:\n\n1. *Extra*\n2. *Jumbo*");
  } 
  
  // Handle "Excluir" action: remove item from list, return to confirmation
  else if (action === 'Excluir') {

    if (order.items.length === 1) {
      console.log("Bloqueando tentativa de exclusão do último item.");
      agent.add(`Não é possível excluir o único item do pedido, pois isso cancelaria o pedido.\n\nO que deseja fazer com este item?\n${promptMessage}`);
      agent.context.set({ 
        name: contextName, 
        lifespan: 5, 
        parameters: { 
          orderToEdit: order, 
          editingItemIndex: itemIndex 
        } 
      });
      return;
    }

    order.items.splice(itemIndex, 1);

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
      if (dozenCount >= freeShipping) {
        shipping = 0;
      } else {
        shipping = shippingValue;
      }

      order.subtotal = subtotal;
      order.shipping = shipping;
      order.total = subtotal + shipping;

    } catch (error) {
      console.error("Error while recalculating value after exclusion: ", error);
      agent.context.set({ name: contextName, lifespan: 0 });
      agent.add(`Houve um problema ao atualizar o pedido após a exclusão. Refaça o Pedido.`);
      return;
    }

    agent.context.set({
      name: contextName,
      lifespan: 0,
    });

    agent.context.set({
      name: CONFIRMATION_CONTEXT,
      lifespan: 5,
      parameters: { orderToConfirm: order }
    });

    const confirmationMessage = buildOrderConfirmationMessage(order);
    agent.add(confirmationMessage);
  } 
  
  // If action is invalid, prompt user again
  else {
    agent.add(`Ação inválida.\n\n${promptMessage}`);
  
    agent.context.set({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: order, editingItemIndex: itemIndex }
    });
  }
}

// Async handler to update the quantity of dozens for a specific item in the order
async function handleEditItemQuantity(agent) {
  
  const contextName = 'awaiting_item_quantity';

  // Retrieve the context where the order data and item index are stored
  const context = agent.context.get(contextName);
  
  // Validate if the context exists and has necessary parameters
  if (!context?.parameters?.orderToEdit || context?.parameters?.editingItemIndex === undefined) {
    // If context is missing or corrupted, inform the user
    agent.add("Não consegui localizar o item para atualizar a quantidade.");
    
    // Clean the context to prevent getting stuck in this state
    agent.context.set({
      name: contextName,
      lifespan: 0,
    });
    
    return;
  }

  // Parse the order object
  const order = context.parameters.orderToEdit;
  const itemIndex = context.parameters.editingItemIndex;

  // Get the new quantity from the user's input
  const newQuantity = agent.parameters['dozenQuantity'];
  
  // Validate that the quantity is a positive integer
  if (typeof newQuantity !== 'number' || newQuantity <= 0 || !Number.isInteger(newQuantity)) {
    
    // If invalid, inform the user and prompt again
    agent.add("Por favor, informe uma quantidade válida.");
    
    // Reset the same context to keep the state and allow retry
    agent.context.set({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: order, editingItemIndex: itemIndex }
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
    if (dozenCount >= freeShipping) {
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
    agent.context.set({ name: contextName, lifespan: 0 });
    agent.add(`Houve um problema ao atualizar a quantidade. Refaça o Pedido.`);
    return;
  }

  agent.context.set({
      name: contextName,
      lifespan: 0,
  });

  // Move user back to the order confirmation flow after updating
  agent.context.set({
    name: CONFIRMATION_CONTEXT,
    lifespan: 5,
    parameters: { orderToConfirm: order }
  });

  const confirmationMessage = buildOrderConfirmationMessage(order);
  agent.add(confirmationMessage);
}

// Async handler for updating the egg type of a specific item in the order
async function handleEditItemType(agent) {

  const contextName = 'awaiting_item_type';

  // Retrieve the context where the order data and item index are stored
  const context = agent.context.get(contextName);
  
  // Check if the context exists and has valid data
  if (!context?.parameters?.orderToEdit || context?.parameters?.editingItemIndex === undefined) {
    // If not, inform the user that the item couldn't be found
    agent.add("Não consegui localizar o item para atualizar o tipo.");

    // Clear the context to avoid further confusion
    agent.context.set({
      name: contextName,
      lifespan: 0,
    });

    return;
  }

  // Parse the order object
  const order = context.parameters.orderToEdit;
  const itemIndex = context.parameters.editingItemIndex;

  // Retrieve the new egg type provided by the user
  const newType = agent.parameters['eggType'];

  // Define the allowed egg types
  const validTypes = ['extra', 'jumbo'];

  // Validate if user provided a valid egg type
  if (!newType || !validTypes.includes(newType.toLowerCase())) {
    // If invalid, ask again for a valid input
    agent.add("Por favor, informe um tipo de ovo válido: \n\n1. *Extra*\n2. *Jumbo*");
    
    // Re-set the same context to keep order state and retry
    agent.context.set({
      name: contextName,
      lifespan: 5,
      parameters: { orderToEdit: order, editingItemIndex: itemIndex }
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
    if (dozenCount >= freeShipping) {
      shipping = 0;
    } else {
      shipping = shippingValue;
    }

    order.subtotal = subtotal;
    order.shipping = shipping;
    order.total = subtotal + shipping;

  } catch (error) {
    console.error("Error while recalculating values: ", error);
    agent.context.set({ name: contextName, lifespan: 0 });
    agent.add(`Houve um problema ao atualizar o tipo. Refaça o Pedido.`);
    return;
  }

  agent.context.set({
      name: contextName,
      lifespan: 0,
    });

  // After updating, move the flow back to order confirmation context
  agent.context.set({
    name: CONFIRMATION_CONTEXT,
    lifespan: 5,
    parameters: { orderToConfirm: order }
  });

  const confirmationMessage = buildOrderConfirmationMessage(order);
  agent.add(confirmationMessage);
}

module.exports = {
  handleEditAction,
  handleEditOrderChangeDate,
  handleEditOrderChangePaymentMethod,
  handleEditOrderChangeAddress,
  handleAddressCompletionEdit,
  handleCaptureEditAddressNumber,
  handleChooseItemToEdit,
  handleOrderItemAction,
  handleEditItemQuantity,
  handleEditItemType,
};