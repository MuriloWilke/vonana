const { getBrazilToday } = require('../utils/dateUtils');

const { calculateNextDeliveryDay } = require('../utils/deliveryUtils');

const { continueOrderAfterValidation, createAndSaveOrder } = require('../services/orderService');

async function handleOrder(agent) {

  // Context names for each stage of validation, used for correcting invalid data later
  const dozensContextName = 'awaiting_valid_dozens_mixed_order';
  const eggTypeContextName = 'awaiting_valid_egg_type_mixed_order';
  const preferredDeliveryDayContextName = 'awaiting_valid_preferred_delivery_day';
  const methodContextName = 'awaiting_valid_method';

  try {

    // Retrieve client ID
    //const whatsappClientId = agent.parameters.whatsappClientId;

    // Hardcoded client ID for testing purposes
    const whatsappClientId = 'whatsapp:+15551234568';

    // If client ID is not found, stop processing
    if (!whatsappClientId){
      console.error("WhatsApp Client ID not received in the Fulfillment.");
      agent.add("Desculpe, não consegui identificar seu usuário para fazer o pedido. Por favor, tente novamente mais tarde.");
      return;
    }

    // Extract parameters sent by Dialogflow from the user's input
    const dozensArray = agent.parameters.dozens; // Array of dozens (quantities)
    const method = Number(agent.parameters.method); // Payment method
    const eggTypeArray = agent.parameters.eggType; // Array of egg types (e.g. 'extra', 'jumbo')
    const preferredDeliveryDay = Number(agent.parameters.preferredDeliveryDay); // Delivery day

    // Validate that both dozens and egg types are present, have the same length, and are non-empty arrays
    if (!Array.isArray(dozensArray) || !Array.isArray(eggTypeArray) || 
        dozensArray.length === 0 || eggTypeArray.length === 0 || 
        dozensArray.length !== eggTypeArray.length
      ) {

      console.warn(`Mismatched or missing dozens/egg type arrays. Dozens: ${dozensArray}, Types: ${eggTypeArray}`);
      agent.add("Para um pedido misto, por favor, diga a quantidade e o tipo para cada item, como '3 dúzias extra e 2 dúzias jumbo'.");

      return;
    }

    // Validate each dozens value individually (must be positive integers)
    for (const dozen of dozensArray) {
      if (typeof dozen !== 'number' || dozen <= 0 || !Number.isInteger(dozen)) {

        console.warn(`Invalid or non-positive integer found in dozens array: ${dozen}. Setting context '${dozensContextName}'.`);
        agent.add("Parece que um dos números de dúzias não é válido. Por favor, diga um número inteiro positivo para cada tipo.");
        
        // If invalid, set context to handle corrected dozens
        agent.setContext({
            name: dozensContextName,
            lifespan: 2,
            parameters: {
              whatsappClientId: whatsappClientId,
              originalOrderEggTypeArray: eggTypeArray,
              originalOrderPreferredDeliveryDay: preferredDeliveryDay,
              originalOrderMethod: method,
            }
          });
        return;
      }
    }

    // Validate egg type values individually (must be either 'extra' or 'jumbo')
    const validEggTypes = ['extra', 'jumbo'];
    const validatedEggTypeArray = eggTypeArray.map(type => type.toLowerCase()); // Normalize to lowercase for easier comparison

    for (const type of validatedEggTypeArray) {
      if (!validEggTypes.includes(type)) {
        console.warn(`Invalid egg type found in array: ${type}. Setting context '${eggTypeContextName}'.`);
        agent.add(`Não reconheci um dos tipos de ovo. Por favor, diga Extra ou Jumbo.`);
        
        // If invalid, set context to handle corrected egg types
        agent.setContext({
          name: eggTypeContextName,
          lifespan: 2,
          parameters: {
            whatsappClientId: whatsappClientId,
            originalOrderDozensArray: dozensArray,
            originalOrderPreferredDeliveryDay: preferredDeliveryDay,
            originalOrderMethod: method,
          }
        });
        return;
      }
    }

    // Validate delivery day
    const validDaysMap = {
      1: 1,
      2: 4,
      3: 6,
    };

    const validDays = [1, 2, 3];

    if (typeof preferredDeliveryDay !== 'number' || !validDays.includes(preferredDeliveryDay)){
      console.warn(`Invalid preferred delivery day received: ${preferredDeliveryDay}`);
      agent.add("Por favor, escolha um dia para entrega válido.\nQual será o dia para entrega?\n1. Segunda\n2. Quinta\n3. Sábado");
      
      // If invalid, set context to handle corrected delivery day
      agent.setContext({
        name: preferredDeliveryDayContextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: dozensArray,
          originalOrderEggTypeArray: validatedEggTypeArray,
          originalOrderMethod: method,
        }
      });
      return;
    }

    // Calculate the actual delivery date based on today's date and the requested weekday
    const targetDayIndex = validDaysMap[preferredDeliveryDay];
    const today = getBrazilToday();
    today.setHours(0, 0, 0, 0); // Normalize time for easier calculation
    const currentDayIndex = today.getDay();

    // Utility function that calculates the next correct delivery date
    const deliveryDate = calculateNextDeliveryDay(targetDayIndex, currentDayIndex)

    // Validate payment method
    const validMethods = [1, 2, 3, 4];

    if (typeof method !== 'number' || !validMethods.includes(method)) {
      console.warn(`Invalid payment method received: ${method}`);
      agent.add("Por favor, escolha uma forma de pagamento válida.\nQual será a forma de pagamento?\n1. Cartão de Crédito\n2. Pix\n3. Débito\n4. Dinheiro");
      
      // If invalid, set context to handle corrected payment method
      agent.setContext({
        name: methodContextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: dozensArray,
          originalOrderEggTypeArray: validatedEggTypeArray,
          originalOrderPreferredDeliveryDay: deliveryDate,
        }
      });
      return;
    }

    // All validations passed: prepare validated order parameters    
    const validatedOrderParams = {
      dozensArray: dozensArray,
      eggTypeArray: validatedEggTypeArray,
      deliveryDate: deliveryDate,
      method: method,
    };

    // Pass control to the next function that will continue processing the order
    await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);
  } catch (error) {
    // Handle any unexpected errors
    console.error("An error occurred during initial order handler flow:", error);
    agent.add(`Desculpe, tive um problema interno. Por favor, tente novamente mais tarde.`);
    throw error;
  }
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
    const context = agent.getContext(contextName);
    
    // If no valid context/order found, notify user and clear context
    if (!context || !context.parameters?.orderToConfirm) {
      agent.add("Desculpe, parece que perdi o pedido");
      
      agent.setContext({ name: contextName, lifespan: 0 });
      
      return;
    }

    // Get the user's confirmation action from their message (expecting first word)
    const action = agent.parameters.confirmationMessage[0];

    // Handle cancellation request
    if (action === 'Cancelar') {
      agent.add("O pedido foi cancelado com sucesso. Se precisar de algo, estou à disposição.");
      
      agent.setContext({ name: contextName, lifespan: 0 });
      
      return;
    }

    // Handle request to edit the order
    if (action === 'Editar') {
      agent.add("Sem problemas! O que você gostaria de alterar? \n\n- *Data de entrega*\n- *Itens*\n- *Método de Pagamento*\n- *Endereço*");
      
      agent.setContext({ name: contextName, lifespan: 0 });

      agent.setContext({
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

      // Save order to database and get reference
      const docRef = await createAndSaveOrder(order);

      agent.add(`Seu pedido foi confirmado e salvo com sucesso! O ID do pedido é ${docRef.id}.`);
      // Clear confirmation context
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    // If user input doesn't match expected actions
    agent.add("Desculpe, não entendi sua escolha. Por favor, responda com *Confirmar*, *Editar* ou *Cancelar*.");

    agent.setContext({
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
    agent.setContext({ name: contextName, lifespan: 0 });
  }
}

module.exports = {
  handleOrder,
  handleOrderConfirmation
};