const db = require('../firestore/firestore');
const { ensureClientExistsAndAddressSaved } = require('../services/clientService');
const { processOrderFlow } = require('../services/orderService');
const { validateOriginalOrderArrays } = require('../utils/validationUtils'); // if you have it

async function handleAddress(agent) {
  const contextName = 'awaiting_address_for_order';

  try {
    const providedAddress = agent.parameters.shippingAddress;
    const originalContext = agent.getContext(contextName);

    if (!originalContext?.parameters) {
      agent.add("Desculpe, perdi as informações da sua conversa. Por favor, refaça seu pedido");
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    const params = originalContext.parameters;
    const whatsappClientId = params.whatsappClientId;

    if (!whatsappClientId || !providedAddress) {
      agent.add("Desculpe, não consegui processar o endereço. Podemos tentar novamente?");
      agent.setContext({ name: contextName, lifespan: 0 });
      return;
    }

    validateOriginalOrderArrays(agent, params, contextName);

    agent.setContext({ name: contextName, lifespan: 0 });

    await ensureClientExistsAndAddressSaved(db, whatsappClientId, providedAddress);

    const orderParams = {
      clientId: whatsappClientId,
      dozensArray: params.originalOrderDozensArray,
      eggTypeArray: params.originalOrderEggTypeArray,
      method: params.originalOrderMethod,
      shippingAddress: providedAddress,
      deliveryDate: params.originalOrderDeliveryDate
    };

    await processOrderFlow(agent, whatsappClientId, orderParams);

  } catch (error) {
    console.error("Error in handleAddress:", error);
    agent.add("Desculpe, tivemos um problema ao finalizar seu pedido. Por favor, tente novamente.");
    agent.setContext({ name: contextName, lifespan: 0 });
    throw error;
  }
}

module.exports = { handleAddress };