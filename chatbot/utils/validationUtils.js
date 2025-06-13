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

    console.log("Method value validated successfully.");
    return method;
}

/**
 * Validates and normalizes the values inside the egg type array.
 * 
 * Ensures that:
 *  - The input is a valid non-empty array.
 *  - Each value matches one of the allowed egg types ("extra" or "jumbo").
 *  - Values are normalized to lowercase.
 * 
 * @param {object} agent - The Dialogflow agent object (not used here, but kept for consistency with other validators).
 * @param {Array} eggTypeArray - Array containing egg type values provided by the user.
 * @returns {Array} - The validated and normalized egg type array.
 * 
 * @throws Will throw an error if the input is invalid or contains invalid egg types.
 */
function validateEggTypeArrayValues(agent, eggTypeArray) {
    // Check if the input is a non-empty array
    if (!Array.isArray(eggTypeArray) || eggTypeArray.length === 0) {
        console.error("Validation failed: Egg type array is not an array or is empty.");
        throw new Error("Os tipos de ovo parecem incorretos.");
    }

    const validEggTypes = ['extra', 'jumbo'];
    const validatedEggTypeArray = [];

    // Loop through each item and validate
    for (const type of eggTypeArray) {
        // Normalize to lowercase string for comparison
        const normalizedType = typeof type === 'string' ? type.toLowerCase() : '';
        
        // Check if type is valid
        if (!validEggTypes.includes(normalizedType)) {
            console.warn(`Validation failed: Invalid egg type found in array: ${type}`);
            throw new Error(`Invalid egg type value: ${type}`);
        }

        validatedEggTypeArray.push(normalizedType);
    }

    console.log("Egg type array values validated successfully.");
    
    // Return the fully validated & normalized array
    return validatedEggTypeArray;
}

/**
 * Validates the values inside the dozens array.
 * 
 * Ensures that:
 *  - The input is a valid non-empty array.
 *  - Each value is a positive integer (representing dozens).
 * 
 * @param {object} agent - The Dialogflow agent object (not used here but kept for consistency).
 * @param {Array} dozensArray - Array containing quantities of dozens provided by the user.
 * @returns {Array} - The validated dozens array (unchanged if valid).
 * 
 * @throws Will throw an error if the input is invalid or contains non-positive integers.
 */
function validateDozensArrayValues(agent, dozensArray) {
    // Check if input is a valid non-empty array
    if (!Array.isArray(dozensArray) || dozensArray.length === 0) {
        console.error("Validation failed: Dozens array is not an array or is empty.");
        throw new Error("Invalid dozens array structure.");
    }

    // Loop through and validate each dozen value
    for (const dozen of dozensArray) {
        if (typeof dozen !== 'number' || dozen <= 0 || !Number.isInteger(dozen)) {
            console.warn(`Validation failed: Invalid or non-positive integer found in dozens array: ${dozen}`);
            throw new Error(`Invalid dozen value: ${dozen}`);
        }
    }

    console.log("Dozens array values validated successfully.");

    // Return the validated array
    return dozensArray;
}

module.exports = {
  validateOriginalOrderArrays,
  validateMethodValue,
  validateEggTypeArrayValues,
  validateDozensArrayValues
};