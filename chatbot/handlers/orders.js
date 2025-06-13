const { getBrazilToday} = require('../utils/dateUtils');
const { validateDeliveryDayValue, calculateNextDeliveryDay } = require('../utils/deliveryUtils')
const { continueOrderAfterValidation } = require('../services/orderService');

async function handleCorrectedMethod(agent) {
  
  // Context where we're waiting for the corrected payment method
  const contextName = 'awaiting_valid_method';
  
  try {

    // Retrieve the corrected payment method value provided by the user
    const correctedMethod = agent.parameters.method;

    // Retrieve the original context to access previously collected order data
    const originalContext = agent.getContext(contextName);

    // Validate that context and parameters still exist (i.e. session hasn't expired)
    if (!originalContext || !originalContext.parameters) {
      console.error("Missing original context or parameters in handleCorrectedMethod.");
      agent.add("Desculpe, perdi as informações do seu pedido. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;

    // Validate that client ID is still available to process the correction
    if (!whatsappClientId) {
      console.error("Missing client ID in handleCorrectedMethod. Original Params:", originalParams);
      agent.add("Desculpe, não consegui identificar seu usuário para processar a correção. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    console.log(`Handling corrected method for client ${whatsappClientId}. Context: '${contextName}'.`);

    // Validate that previous dozens and egg type data is still structurally correct
    validateOriginalOrderArrays(agent, originalParams, contextName);

    // Retrieve original parameters from the context
    const originalDozensArray = originalParams.originalOrderDozensArray;
    const originalEggTypeArray = originalParams.originalOrderEggTypeArray;
    const originalPreferredDeliveryDay = originalParams.originalOrderPreferredDeliveryDay;
    console.log("Original order parameters from context obtained:", { originalDozensArray, originalEggTypeArray });

    // Validate the corrected payment method provided by the user
    let validatedMethod;
    try {
      validatedMethod = validateMethodValue(agent, correctedMethod);
      console.log("Corrected method value is valid.");

    } catch (methodValueError) {
      // If payment method is invalid, prompt the user again to choose a valid one
      console.warn(`Validation of corrected method value failed: ${methodValueError.message}. Staying in context '${contextName}'.`);
      agent.add("Por favor, escolha uma forma de pagamento válida para o seu pedido:\n1. Cartão de Crédito\n2. Pix\n3. Débito\n4. Dinheiro");
      
      // Keep user inside the same context for another attempt, preserving previously collected data
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: originalDozensArray,
          originalOrderEggTypeArray: originalEggTypeArray,
          originalOrderPreferredDeliveryDay: originalPreferredDeliveryDay,
        }
      });
      return;
    }

    // If method validation succeeded, log confirmation
    console.log(`Corrected payment method validated for ${whatsappClientId}: ${validatedMethod}. Proceeding to address check.`);

    // All validations passed; clear the current context as we’re ready to proceed
    agent.setContext({ name: contextName, lifespan: 0 });
    console.log(`Context '${contextName}' cleared.`);

    // Prepare validated order parameters to pass into the next phase of the flow
    const validatedOrderParams = {
      dozensArray: originalDozensArray,
      eggTypeArray: originalEggTypeArray,
      deliveryDate: originalPreferredDeliveryDay,
      method: validatedMethod,
    };
    console.log("Calling continueOrderAfterValidation with:", validatedOrderParams);

    // Call the function that continues the order processing with validated data
    await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);
    console.log("continueOrderAfterValidation completed from handleCorrectedMethod.");

  } catch (error) {
    // Catch any unexpected error during processing
    console.error("An error occurred during handleCorrectedMethod:", error);

    // If no user-friendly message was already added, add a generic error message
    if (!agent.responseMessages || agent.responseMessages.length === 0) {
      agent.add("Desculpe, tivemos um problema interno ao processar a forma de pagamento. Por favor, refaça seu pedido");
    }
    
    // Cleaning the context
    agent.setContext({ name: contextName, lifespan: 0 });
  }
}

async function handleCorrectedDeliveryDay(agent){

  // Define context names used during egg type correction and validation stages
  const contextName = 'awaiting_valid_preferred_delivery_day';
  const methodContextName = 'awaiting_valid_method';

  try {

    // Get the corrected delivery day value provided by the user
    const correctedPreferredDeliveryDay = agent.parameters.preferredDeliveryDay;
    console.log("Received corrected preferred delivey day:", correctedPreferredDeliveryDay);

    // Retrieve the original context where previous order information is stored
    const originalContext = agent.getContext(contextName);

    // Validate that the context and parameters exist (i.e. haven't expired or been cleared)
    if (!originalContext || !originalContext.parameters) {
      console.error(`Missing original context or parameters in ${contextName} handler.`);
      agent.add("Desculpe, perdi as informações do seu pedido. Por favor, refaça seu pedido");
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;

    // Validate that we still have the client ID to proceed
    if (!whatsappClientId) {
      console.error(`Missing client ID in ${contextName} handler. Original Params:`, originalParams);
      agent.add("Desculpe, não consegui identificar seu usuário para processar a correção. Por favor, refaça seu pedido");
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    console.log(`Handling corrected egg types for client ${whatsappClientId}. Context: '${contextName}'.`);

    // Validate that the original dozens and egg type arrays are structurally correct
    validateOriginalOrderArrays(agent, originalParams, contextName);

    // Retrieve original order parameters from context
    const originalDozensArray = originalParams.originalOrderDozensArray;
    const originalMethod = originalParams.originalOrderMethod;
    const originalEggTypeArray = originalParams.originalOrderEggTypeArray;

    // Validating the new delivery date
    let validatedDeliveryDate;
    try {
      validatedDeliveryDate = validateDeliveryDayValue(agent, correctedPreferredDeliveryDay);
      console.log("Delivery date is valid.");

    } catch (deliveryDateError) {
      // If delivery date is invalid, prompt the user again
      console.warn(`Validation of corrected preferred delivery day failed after dozens and types correction: ${deliveryDateError.message}. Setting context '${preferredDeliveryDayContextName}'.`);
      agent.add("Por favor, escolha um dia para entrega válido.\nQual será o dia para entrega?\n1. Segunda\n2. Quinta\n3. Sábado");
      
      // Keep user in the same correction context for another attempt
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: originalDozensArray,
          originalOrderEggTypeArray: originalEggTypeArray,
          originalOrderMethod: originalMethod,
        }
      });
      return;
    }
    
    try {
      // Validate original payment method saved previously
      validateMethodValue(agent, originalMethod);
      console.log("Original method from context is valid. All parameters are validated.");

      // All data is valid, clear the current context
      agent.setContext({ name: contextName, lifespan: 0 });
      console.log(`Context '${contextName}' cleared.`);

      // Prepare validated parameters to continue the order flow
      const validatedOrderParams = {
        dozensArray: originalDozensArray,
        eggTypeArray: originalEggTypeArray,
        deliveryDate: validatedDeliveryDate,
        method: originalMethod,
      };
      console.log("Calling continueOrderAfterValidation with:", validatedOrderParams);

       // Call function to proceed to next order processing step
      await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);
      console.log("continueOrderAfterValidation completed from handleCorrectedDeliveryDayOrder.");

    } catch (methodError) {
      // If payment method validation fails, redirect user to correct it
      console.warn(`Validation of original method failed after types correction: ${methodError.message}. Setting context '${methodContextName}'.`);
      agent.add("Por favor, escolha uma forma de pagamento válida para o seu pedido:\n1. Cartão de Crédito\n2. Pix\n3. Débito\n4. Dinheiro");
      
      // Set method correction context and preserve other validated data
      agent.setContext({
        name: methodContextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: originalDozensArray,
          originalOrderEggTypeArray: originalEggTypeArray,
          originalOrderPreferredDeliveryDay: validatedDeliveryDate,
        }
      });
      return;
    }

  } catch (error){
    
    // This outer catch handles any unexpected error during processing
    console.error(`An error occurred during ${contextName} handler for client ${whatsappClientId}:`, error);

    // If no response message has been added yet, send a generic error
    if (!agent.responseMessages || agent.responseMessages.length === 0) {
      agent.add("Desculpe, tivemos um problema interno ao processar a data de entrega. Por favor, refaça seu pedido");
    }

    // Clean the current context on any unexpected error
    agent.setContext({ name: contextName, lifespan: 0 });
  }
}

async function handleCorrectedEggType(agent) {

  // Define context names used during egg type correction and validation stages
  const contextName = 'awaiting_valid_egg_type_mixed_order';
  const methodContextName = 'awaiting_valid_method';
  const preferredDeliveryDayContextName = 'awaiting_valid_preferred_delivery_day';

  try {
    
    // Get the corrected egg types provided by the user
    const correctedEggTypeArray = agent.parameters.eggType;
    console.log("Received corrected egg type array:", correctedEggTypeArray);

    // Retrieve the original order context from Dialogflow
    const originalContext = agent.getContext(contextName);

    // Handle missing context (possible expiration or broken flow)
    if (!originalContext || !originalContext.parameters) {
      console.error(`Missing original context or parameters in ${contextName} handler.`);
      agent.add("Desculpe, perdi as informações do seu pedido. Por favor, refaça seu pedido");
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;

    // Check if client ID exists to identify the user
    if (!whatsappClientId) {
      console.error(`Missing client ID in ${contextName} handler. Original Params:`, originalParams);
      agent.add("Desculpe, não consegui identificar seu usuário para processar a correção. Por favor, refaça seu pedido");
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    console.log(`Handling corrected egg types for client ${whatsappClientId}. Context: '${contextName}'.`);

    // Validate the original arrays structure from context to make sure they are still consistent
    validateOriginalOrderArrays(agent, originalParams, contextName);

    // Retrieve previous values stored before correction
    const originalDozensArray = originalParams.originalOrderDozensArray;
    const originalMethod = originalParams.originalOrderMethod;
    const originalPreferredDeliveryDay = originalParams.originalOrderPreferredDeliveryDay;

    // Ensure the corrected egg type array length matches the original dozens array length
    if (!Array.isArray(correctedEggTypeArray) || correctedEggTypeArray.length !== originalDozensArray.length) {
      console.warn(`Mismatched or invalid corrected egg types array structure received: ${correctedEggTypeArray}. Expected length based on dozens: ${originalDozensArray.length}`);
      agent.add(`A quantidade de tipos de ovo que você disse não corresponde à quantidade de dúzias que você pediu anteriormente. Por favor, diga o tipo correto (Extra ou Jumbo) para cada quantidade.`);

      // Keep user in the same context and reprompt
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: originalDozensArray,
          originalOrderMethod: originalMethod,
          originalOrderPreferredDeliveryDay: originalPreferredDeliveryDay,
        }
      });
      return;
     }

    // Validate egg types values (Extra / Jumbo) inside the array
    let validatedEggTypeArray = [];
    try {
      validatedEggTypeArray = validateEggTypeArrayValues(agent, correctedEggTypeArray);
      console.log("Corrected egg type values are valid.");

    } catch (typeValueError) {
      // If invalid egg type was provided
      console.warn(`Validation of corrected egg type values failed: ${typeValueError.message}. Staying in context '${contextName}'.`);
      agent.add(`Não reconheci um dos tipos de ovo. Por favor, diga Extra ou Jumbo para cada quantidade.`);
      
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: originalDozensArray,
          originalOrderMethod: originalMethod,
          originalOrderPreferredDeliveryDay: originalPreferredDeliveryDay,
        }
      });
      return;
    }

    console.log("Corrected egg types values are valid. Now validating method from context.");
    
    let validatedDeliveryDate;
    try {
      // Validate delivery date from the context
      validatedDeliveryDate = validateDeliveryDayValue(agent, originalPreferredDeliveryDay);
      console.log("Delivery date is valid.");

    } catch (deliveryDateError) {
      // If delivery day is invalid, ask the user to re-enter it
      console.warn(`Validation of original preferred delivery day failed after dozens and types correction: ${deliveryDateError.message}. Setting context '${preferredDeliveryDayContextName}'.`);
      agent.add("Por favor, escolha um dia para entrega válido.\nQual será o dia para entrega?\n1. Segunda\n2. Quinta\n3. Sábado");
      
      agent.setContext({
        name: preferredDeliveryDayContextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: validatedDozensArray,
          originalOrderEggTypeArray: validatedEggTypeArray,
          originalOrderMethod: originalMethod,
        }
      });
      return;
    }
    
    try {
      // Validate payment method from context
      validateMethodValue(agent, originalMethod);
      console.log("Original method from context is valid. All parameters are validated.");

      // All validations succeeded — clear current context
      agent.setContext({ name: contextName, lifespan: 0 });
      console.log(`Context '${contextName}' cleared.`);

      // Prepare final validated parameters to continue order flow
      const validatedOrderParams = {
        dozensArray: originalDozensArray,
        eggTypeArray: validatedEggTypeArray,
        deliveryDate: validatedDeliveryDate,
        method: originalMethod,
      };
      console.log("Calling continueOrderAfterValidation with:", validatedOrderParams);

      // Continue the order flow
      await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);
      console.log("continueOrderAfterValidation completed from handleCorrectedEggTypeMixedOrder.");

    } catch (methodError) {
      // If payment method is invalid, request correction
      console.warn(`Validation of original method failed after types correction: ${methodError.message}. Setting context '${methodContextName}'.`);
      agent.add("Por favor, escolha uma forma de pagamento válida para o seu pedido:\n1. Cartão de Crédito\n2. Pix\n3. Débito\n4. Dinheiro");
      
      agent.setContext({
        name: methodContextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: originalDozensArray,
          originalOrderEggTypeArray: validatedEggTypeArray,
          originalOrderPreferredDeliveryDay: validatedDeliveryDate,
        }
      });
      return;
    }

  } catch (error) {
    // Global catch block for unexpected failures during egg type correction
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

async function handleCorrectedDozens(agent) {

  // Context names used for different validation stages
  const contextName = 'awaiting_valid_dozens_mixed_order';
  const eggTypeContextName = 'awaiting_valid_egg_type_mixed_order';
  const methodContextName = 'awaiting_valid_method';
  const preferredDeliveryDayContextName = 'awaiting_valid_preferred_delivery_day';

  try {

    // Retrieve the corrected dozens values provided by the user
    const correctedDozensArray = agent.parameters.dozens;
    console.log("Received corrected dozens array:", correctedDozensArray);

    const originalContext = agent.getContext(contextName);

    // Retrieve the existing context containing the previously captured order data
    if (!originalContext || !originalContext.parameters) {
      console.error("Missing original context or parameters in handleCorrectedDozens.");
      agent.add("Desculpe, perdi as informações do seu pedido. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    const originalParams = originalContext.parameters;
    const whatsappClientId = originalParams.whatsappClientId;

    // Ensure that the client ID still exists in context
    if (!whatsappClientId) {
      console.error("Missing client ID in handleCorrectedDozens. Original Params:", originalParams);
      agent.add("Desculpe, não consegui identificar seu usuário para processar a correção. Por favor, refaça seu pedido");
      // Cleaning the context
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }
    console.log(`Handling corrected dozens for client ${whatsappClientId}. Context: '${contextName}'.`);

    // Validate that original egg type array and other context data are still valid (structure check)
    validateOriginalOrderArrays(agent, originalParams, contextName);

    // Retrieve the original values for the other order parameters from the context
    const originalEggTypeArray = originalParams.originalOrderEggTypeArray;
    const originalMethod = originalParams.originalOrderMethod;
    const originalPreferredDeliveryDay = originalParams.originalOrderPreferredDeliveryDay;

    // Check if the corrected dozens array length matches the original egg types length
    if (!Array.isArray(correctedDozensArray) || correctedDozensArray.length !== originalEggTypeArray.length) {
      console.warn(`Mismatched or invalid corrected dozens array structure received: ${correctedDozensArray}. Expected length based on types: ${originalEggTypeArray.length}`);
      agent.add(`A quantidade de números que você disse não corresponde à quantidade de tipos de ovos que você pediu anteriormente. Por favor, diga a quantidade correta para cada tipo de ovo que você quer (${originalEggTypeArray.join(' e ')}).`);

      // Re-prompt and keep the user in the same context
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderEggTypeArray: originalEggTypeArray,
          originalOrderMethod: originalMethod,
          originalOrderPreferredDeliveryDay: originalPreferredDeliveryDay,
        }
      });
      return;
    }

    let validatedDozensArray = [];
    try{
      // Validate that each value in corrected dozens array is a positive integer
      validatedDozensArray = validateDozensArrayValues(agent, correctedDozensArray);
      console.log("Corrected dozens values are valid.");

    } catch (dozenValueError) {
      console.warn(`Validation of corrected dozens values failed: ${dozenValueError.message}. Staying in context '${contextName}'.`);
      agent.add("Parece que um dos números de dúzias não é válido. Por favor, diga um número inteiro positivo para cada tipo.");
      
      // Retry dozens correction
      agent.setContext({
        name: contextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderEggTypeArray: originalEggTypeArray,
          originalOrderPreferredDeliveryDay: originalPreferredDeliveryDay,
          originalOrderMethod: originalMethod,
        }
      });
      return;
    }

    // Proceed to validate egg types after dozens correction
    console.log("Corrected dozens values are valid. Now validating egg types from context.");
    
    let validatedEggTypeArray = [];
    try {
      // Validate egg types previously stored in context
      validatedEggTypeArray = validateEggTypeArrayValues(agent, originalEggTypeArray);
      console.log("Original egg types from context are valid. Now validating delivery date from context.");
      
    } catch (eggTypeError){
      console.warn(`Validation of original egg type failed after dozens correction: ${eggTypeError.message}. Setting context '${eggTypeContextName}'.`);
      agent.add(`Não reconheci um dos tipos de ovo. Por favor, diga Extra ou Jumbo para cada quantidade.`);
      
      // Switch to egg type correction context
      agent.setContext({
        name: eggTypeContextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: validatedDozensArray,
          originalOrderPreferredDeliveryDay: originalPreferredDeliveryDay,
          originalOrderMethod: originalMethod,
        }
      });
      return;
    }

    let validatedDeliveryDate
    try {
      // Validate delivery date previously stored in context
      validatedDeliveryDate = validateDeliveryDayValue(agent, originalPreferredDeliveryDay);
      console.log("Original delivery date from context are valid. Now validating method from context.");
    
    } catch (deliveryDateError){
      console.warn(`Validation of original preferred delivery day failed after dozens and types correction: ${deliveryDateError.message}. Setting context '${preferredDeliveryDayContextName}'.`);
      agent.add("Por favor, escolha um dia para entrega válido.\nQual será o dia para entrega?\n1. Segunda\n2. Quinta\n3. Sábado");
      
      // Switch to delivery day correction context
      agent.setContext({
        name: preferredDeliveryDayContextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: validatedDozensArray,
          originalOrderEggTypeArray: validatedEggTypeArray,
          originalOrderMethod: originalMethod,
        }
      });
      return;
    }
    
    try {
      // Validate payment method previously stored in context
      const validatedMethod = validateMethodValue(agent, originalMethod);
      console.log("Original method from context is valid. All parameters are validated.");

      // Clear dozens correction context since we now have full valid data
      agent.setContext({ name: contextName, lifespan: 0 });
      console.log(`Context '${contextName}' cleared.`);

      // Prepare the full validated order parameters
      const validatedOrderParams = {
        dozensArray: validatedDozensArray,
        eggTypeArray: validatedEggTypeArray,
        deliveryDate: validatedDeliveryDate,
        method: validatedMethod,
      };
      console.log("Calling continueOrderAfterValidation with:", validatedOrderParams);

      // Proceed to finalize the order
      await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);
      console.log("continueOrderAfterValidation completed from handleCorrectedDozensMixedOrder.");

    } catch (methodError) {
      console.warn(`Validation of original method failed after dozens, types and deliveryDate correction: ${methodError.message}. Setting context '${methodContextName}'.`);
      agent.add("Por favor, escolha uma forma de pagamento válida para o seu pedido:\n1. Cartão de Crédito\n2. Pix\n3. Débito\n4. Dinheiro");
      
      // Switch to payment method correction context
      agent.setContext({
        name: methodContextName,
        lifespan: 2,
        parameters: {
          whatsappClientId: whatsappClientId,
          originalOrderDozensArray: validatedDozensArray,
          originalOrderEggTypeArray: validatedEggTypeArray,
          originalOrderPreferredDeliveryDay: validatedDeliveryDate,
        }
      });
      return;
    }

  } catch (error) {
    // Global error handler for unexpected failures during this correction step
    console.error(`An error occurred during ${contextName} handler for client ${whatsappClientId}:`, error);

    // If no previous user message exists, show a generic error
    if (!agent.responseMessages || agent.responseMessages.length === 0) {
      agent.add("Desculpe, tivemos um problema interno ao processar a quantidade. Por favor, refaça seu pedido");
    }

    // Clean the current context to prevent user from getting stuck
    agent.setContext({ name: contextName, lifespan: 0 });
  }
}

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
    const method = Number(agent.parameters.method[0]); // Payment method (converted to number)
    const eggTypeArray = agent.parameters.eggType; // Array of egg types (e.g. 'extra', 'jumbo')
    const preferredDeliveryDay = Number(agent.parameters.preferredDeliveryDay[0]); // Delivery day (converted to number)

    // Debugging logs to track what was received from the user
    console.log("Received dozens array:", dozensArray);
    console.log("Received egg type array:", eggTypeArray);
    console.log("Received preferred delivery day:", preferredDeliveryDay);
    console.log("Received method:", method);

    // Validate that both dozens and egg types are present, have the same length, and are non-empty arrays
    if (!Array.isArray(dozensArray) || !Array.isArray(eggTypeArray) || dozensArray.length === 0 || eggTypeArray.length === 0 || dozensArray.length !== eggTypeArray.length) {
      console.warn(`Mismatched or missing dozens/egg type arrays. Dozens: ${dozensArray}, Types: ${eggTypeArray}`);
      agent.add("Para um pedido misto, por favor, diga a quantidade e o tipo para cada item, como '3 dúzias extra e 2 dúzias jumbo'.");

      return;
    }
    console.log("All dozens values validated.");

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
    console.log("All dozens values validated.");

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
    console.log("All egg types validated.");

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
    console.log("Preferred delivery day validated:", preferredDeliveryDay);

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
    console.log("Payment method validated:", method);

    // All validations passed: prepare validated order parameters
    console.log("All initial parameters validated. Proceeding to continueOrderAfterValidation.");
    const validatedOrderParams = {
      dozensArray: dozensArray,
      eggTypeArray: validatedEggTypeArray,
      deliveryDate: deliveryDate,
      method: method,
    };

    // Pass control to the next function that will continue processing the order
    await continueOrderAfterValidation(agent, whatsappClientId, validatedOrderParams);
    console.log("continueOrderAfterValidation completed from handleOrder.");

  } catch (error) {
    // Handle any unexpected errors
    console.error("An error occurred during initial order handler flow:", error);
    agent.add(`Desculpe, tive um problema interno. Por favor, tente novamente mais tarde.`);
    throw error;
  }
}

module.exports = {
  handleOrder,
  handleCorrectedDozens,
  handleCorrectedEggType,
  handleCorrectedDeliveryDay,
  handleCorrectedMethod
};