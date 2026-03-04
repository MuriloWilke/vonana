const { handleMyOrders } = require('./myOrders');
const { handleCancelOrderRequest } = require('./cancelOrders');
const { handleOrder } = require('./orders');

/**
 * Handles the numeric choice (1, 2, or 3) from the welcome menu.
 * This function is triggered when the 'Welcome - Numeric Choice' intent is matched.
 * @param {WebhookClient} agent The Dialogflow fulfillment agent object
 */
async function handleWelcomeMenuChoice(agent) {
  const contextName = 'awaiting_menu_choice';
  const choice = Number(agent.parameters.menu_choice);

  agent.context.set({ name: contextName, lifespan: 0 });

  // Use a switch statement to handle the user's numeric choice
  switch (choice) {
    case 1:
      agent.context.set({ name: 'awaiting_order_details', lifespan: 5, parameters: {} });
      return handleOrder(agent);
    
    case 2:
      return handleMyOrders(agent);

    case 3:
      agent.context.set({ name: 'awaiting_cancel_order_selection', lifespan: 5, parameters: {} });
      return handleCancelOrderRequest(agent);

    default:
      agent.add("Desculpe, não entendi.\nPor favor, escolha uma opção válida:\n\t1. Fazer um Pedido\n\t2. Ver meus pedidos\n\t3. Cancelar um pedido");
      agent.context.set({ name: contextName, lifespan: 2 });
      break;
  }
}

module.exports = {
  handleWelcomeMenuChoice
};