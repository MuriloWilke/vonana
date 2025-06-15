const { formatCurrency } = require('./currencyUtils');
const { interpretFinalMethod } = require('./paymentUtils');
const { formatOrderDate } = require('./dateUtils');

/**
 * Generates the completed confirmation order text to sent it to the client.
 * 
 * @param {object} order - Order Object (deserialized).
 * @returns {string} - Message ready to send to the client.
 */
function buildOrderConfirmationMessage(order) {
    const formattedTotal = formatCurrency(order.total);

    const lines = order.items.map(item =>
        `- ${item.quantity} dúzias de ovos ${item.type} (${formatCurrency(item.itemValue)})`
    ).join('\n');

    let message = `📦 *Resumo do seu pedido:*\n\nItems:\n${lines}\n\n`;

    if (order.shippingCost) {
        message += `🚚 *Custo de entrega:* ${formatCurrency(order.shippingCost)}\n`;
    }

    message += `💰 *Total:* ${formattedTotal}\n`;
    message += `💳 *Forma de pagamento:* ${interpretFinalMethod(order.paymentMethod)}\n`;

    // Formata o endereço
    const { shippingAddress } = order;
    const addressParts = [
        shippingAddress['business-name'],
        shippingAddress['street-address'],
        [shippingAddress['city'], shippingAddress['admin-area']].filter(Boolean).join(' - '),
        shippingAddress['zip-code'] ? `CEP ${shippingAddress['zip-code']}` : null,
        shippingAddress['country']
    ].filter(Boolean);

    const formattedAddress = addressParts.join(', ');
    message += `📍 *Endereço de entrega:* ${formattedAddress}\n`;

    // Formata a data de entrega
    const formattedDate = formatOrderDate(order.deliveryDate);
    message += `📅 *Data de entrega:* ${formattedDate}\n\n`;

    message += `Escolha: *Confirmar*, *Editar*, ou *Cancelar*`;

    return message;
}

module.exports = {
  buildOrderConfirmationMessage
};