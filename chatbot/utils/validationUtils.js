/**
 * Validates the presence and consistency of original order arrays from Dialogflow context parameters.
 * Throws an error and clears the context if validation fails.
 * 
 * @param {object} agent - Dialogflow agent object
 * @param {object} originalParams - Parameters object from the original context
 * @param {string} contextToClearName - Name of the context to clear on validation failure
 * @throws {Error} Throws if validation fails
 */
function validateOriginalOrderArrays(agent, originalParams, contextToClearName) {
  const originalDozensArray = originalParams.originalOrderDozensArray;
  const originalEggTypeArray = originalParams.originalOrderEggTypeArray;

  // Checking if the original parameters are here and in the expected format
  if (!Array.isArray(originalDozensArray) || !Array.isArray(originalEggTypeArray)) {
    console.error(`Validation failed: Missing or invalid original order arrays from context '${contextToClearName}'. Original Params:`, originalParams);
    agent.add("Desculpe, perdi algumas informações essenciais do seu pedido. Por favor, refaça seu pedido");
    // Cleaning the context
    agent.context.set({ name: contextToClearName, lifespan: 0 });
    // Throw an error to stop further execution in the calling function's try/catch
    throw new Error("Validation failed: Missing or invalid original order arrays in context.");
  }

  // Basic validation for arrays length
  if (originalDozensArray.length === 0 || originalDozensArray.length !== originalEggTypeArray.length) {
    console.error(`Validation failed: Mismatched or empty dozen/type arrays retrieved from context '${contextToClearName}'. Dozens: ${originalDozensArray}, Types: ${originalEggTypeArray}. Original Params:`, originalParams);
    agent.add("Desculpe, as informações do pedido parecem incompletas. Por favor, refaça seu pedido.");
    // Cleaning the context
    agent.context.set({ name: contextToClearName, lifespan: 0 });
    // Throw an error
    throw new Error("Validation failed: Mismatched or empty arrays in context.");
  }

  // If we reach here, validation passed
  return true;
}

/**
 * Validates that the provided payment method is one of the allowed values.
 * 
 * The system currently supports 4 payment methods (1, 2, 3, 4).
 * If the value is invalid, throws an error that should be handled by the caller.
 *
 * @param {WebhookClient} agent - Dialogflow fulfillment agent (not used for response here, but included for consistency)
 * @param {number} method - The payment method value to validate
 * @returns {number} - The validated method value (if valid)
 * @throws {Error} - If the method value is invalid
 */
function validateMethodValue(agent, method) {
    const validMethods = [1, 2, 3, 4];

    // Check if method is a number and is within the list of valid methods
    if (typeof method !== 'number' || !validMethods.includes(method)) {
        console.warn(`Validation failed: Invalid payment method received: ${method}`);
        throw new Error(`Invalid payment method value: ${method}`);
    }

    return method;
}

module.exports = {
  validateOriginalOrderArrays,
  validateMethodValue
};