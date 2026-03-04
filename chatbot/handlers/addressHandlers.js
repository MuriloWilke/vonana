const db = require('../firestore/firestore');
const { ensureClientExistsAndAddressSaved } = require('../services/clientService');
const { processOrderFlow } = require('../services/orderService');
const { validateOriginalOrderArrays } = require('../utils/validationUtils');
const { getAddressFromCEP } = require('../services/cepService');
const { hasNumberInAddress } = require('../utils/addressUtils');

const NUMBER_CONTEXT = 'awaiting_address_number_new';
const COMPLETION_NEW_CONTEXT = 'awaiting_address_completion_new';

async function handleAddress(agent) {
  const contextName = 'awaiting_address_for_order';
  let originalContext;

  try {
    const newAddress = agent.parameters.shippingAddress;
    const providedNumber = agent.parameters.addressNumber;
    const originalContext = agent.context.get(contextName);
    let finalAddress;

    if (!originalContext?.parameters) {
      agent.add("Desculpe, perdi as informações da sua conversa. Por favor, refaça seu pedido");
      agent.context.set({ name: contextName, lifespan: 0 });
      return;
    }

    const params = originalContext.parameters;
    const whatsappClientId = params.whatsappClientId;

    if (!whatsappClientId || !newAddress) {
      agent.add("Desculpe, não consegui processar o endereço. Podemos tentar novamente?");
      agent.context.set({ name: contextName, lifespan: 0 });
      return;
    }

    
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
        parameters: params
      });
      return;
    }

    validateOriginalOrderArrays(agent, params, contextName);

    const hasState = finalAddress['admin-area'] && finalAddress['admin-area'].length > 0;
    const hasCity = finalAddress.city && finalAddress.city.length > 0;
    const hasStreet = finalAddress['street-address'] && finalAddress['street-address'].length > 0;

    if (hasState && hasCity && hasStreet) {      
      await ensureClientExistsAndAddressSaved(db, whatsappClientId, finalAddress);

      const orderParams = {
        clientId: whatsappClientId,
        dozensArray: params.originalOrderDozensArray,
        eggTypeArray: params.originalOrderEggTypeArray,
        paymentMethod: params.originalOrderPaymentMethod,
        shippingAddress: finalAddress,
        deliveryDate: params.originalOrderDeliveryDate
      };

      if (providedNumber) {
        finalAddress['street-address'] += `, ${providedNumber}`;
        orderParams.shippingAddress = finalAddress;
        await db.collection('clients').doc(whatsappClientId).update({ shippingAddress: finalAddress });
        agent.context.set({ name: contextName, lifespan: 0 });
        await processOrderFlow(agent, whatsappClientId, orderParams);
      } 

      else if (hasNumberInAddress(finalAddress['street-address'])) {
        orderParams.shippingAddress = finalAddress;
        await db.collection('clients').doc(whatsappClientId).update({ shippingAddress: finalAddress });
        agent.context.set({ name: contextName, lifespan: 0 });
        await processOrderFlow(agent, whatsappClientId, orderParams);
      }

      else {
        agent.add("Entendi o endereço. Para finalizar, qual é o número da casa ou apartamento?");
        agent.context.set({
          name: NUMBER_CONTEXT,
          lifespan: 2,
          parameters: { orderParams: orderParams, newAddressBase: finalAddress }
        });
        agent.context.set({ name: contextName, lifespan: 0 });
      }

    } else {      
      agent.context.set({
        name: COMPLETION_NEW_CONTEXT,
        lifespan: 5,
        parameters: {
          originalParameters: params,
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
    console.error("Error in handleAddress:", error.message);

    if (error.message.includes("Endereço incompleto") || error.message.includes("Endereço inválido")) {
      userMessage = `${error.message}\nPor favor, informe o endereço completo novamente.`;
    } 
    else if (error.message.includes("CEP")) {
      userMessage = `${error.message}\nPor favor, tente novamente com outro CEP ou digite o endereço.`;
    }
    else {
      userMessage = `Tivemos um problema. Tente Novamente`;
    }

    agent.add(userMessage);
    agent.context.set({ 
      name: contextName, 
      lifespan: 2, 
      parameters: originalContext?.parameters || {} 
    });
  }
}

async function handleAddressCompletionNew(agent) {
  const contextName = COMPLETION_NEW_CONTEXT;
  const context = agent.context.get(contextName);

  if (!context?.parameters?.originalParameters || !context.parameters.partialAddress) {
    agent.add("Desculpe, perdi os dados do seu pedido. Por favor, comece novamente.");
    agent.context.set({ name: contextName, lifespan: 0 });
    return;
  }

  const originalParameters = context.parameters.originalParameters;
  const whatsappClientId = originalParameters.whatsappClientId;
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
      console.log("Endereço fundido:", mergedAddress);
    } else {
      agent.add("Não entendi. Por favor, me diga o Estado, a cidade ou o CEP.");
      agent.context.set({ name: contextName, lifespan: 2, parameters: context.parameters });
      return;
    }

    const hasState = mergedAddress['admin-area'] && mergedAddress['admin-area'].length > 0;
    const hasCity = mergedAddress.city && mergedAddress.city.length > 0;
    const hasStreet = mergedAddress['street-address'] && mergedAddress['street-address'].length > 0;

    if (hasState && hasCity && hasStreet) {
      console.log("Endereço completo. Salvando e checando número.");
      
      await ensureClientExistsAndAddressSaved(db, whatsappClientId, mergedAddress);
      
      agent.context.set({ name: contextName, lifespan: 0 });

      const orderParams = {
        clientId: whatsappClientId,
        dozensArray: originalParameters.originalOrderDozensArray,
        eggTypeArray: originalParameters.originalOrderEggTypeArray,
        paymentMethod: originalParameters.originalOrderPaymentMethod,
        shippingAddress: mergedAddress,
        deliveryDate: originalParameters.originalOrderDeliveryDate
      };

      if (hasNumberInAddress(mergedAddress['street-address'])) {
        await db.collection('clients').doc(whatsappClientId).update({ shippingAddress: mergedAddress });
        await processOrderFlow(agent, whatsappClientId, orderParams);
      } else {
        agent.add("Endereço completo! Para finalizar, qual é o número da casa ou apartamento?");
        agent.context.set({
          name: NUMBER_CONTEXT,
          lifespan: 2,
          parameters: { orderParams: orderParams, newAddressBase: mergedAddress }
        });
      }

    } else {
      agent.context.set({
        name: contextName,
        lifespan: 5,
        parameters: { originalParameters: originalParameters, partialAddress: mergedAddress }
      });

      if (!hasState) {
        agent.add("Certo. Qual é o Estado? Ou o CEP.");
      } 
      
      else if (!hasCity) {
        agent.add("Anotei o estado. E a Cidade? Ou o CEP");
      } 
      
      else if (!hasStreet) {
        agent.add("Perfeito. Agora só falta a Rua e o número.");
      }
    }

  } catch (error) {
    console.error("Error in handleAddressCompletionNew:", error);
    agent.add(`Tivemos um problema: ${error.message}. Vamos tentar de novo. Por favor, informe o estado, cidade ou CEP.`);
    agent.context.set({ name: contextName, lifespan: 2, parameters: context.parameters });
  }
}

async function handleCaptureAddressNumber(agent) {
  const contextName = 'awaiting_address_number_new';
  
  try {
    const number = agent.parameters.addressNumber;
    const context = agent.context.get(contextName);

    if (!context || !context.parameters.orderParams || !context.parameters.newAddressBase) {
      agent.add("Desculpe, perdi os dados do seu pedido. Por favor, comece novamente.");
      agent.context.set({ name: contextName, lifespan: 0 });
      return;
    }

    if (!number) {
      agent.add("Não entendi. Por favor, diga apenas o número (ex: 123, apto 101).");
      agent.context.set({ name: contextName, lifespan: 2, parameters: context.parameters });
      return;
    }

    const orderParams = context.parameters.orderParams;
    let finalAddress = context.parameters.newAddressBase;
    
    finalAddress['street-address'] += `, ${number}`;
    orderParams.shippingAddress = finalAddress;

    await db.collection('clients').doc(orderParams.clientId).update({ shippingAddress: finalAddress });

    agent.context.set({ name: contextName, lifespan: 0 });
    await processOrderFlow(agent, orderParams.clientId, orderParams);

  } catch (error) {
    console.error("Error in handleCaptureAddressNumber:", error);
    agent.add("Desculpe, tivemos um problema ao salvar o número. Por favor, refaça o pedido.");
    agent.context.set({ name: contextName, lifespan: 0 });
  }
}

module.exports = { 
  handleAddress,
  handleAddressCompletionNew,
  handleCaptureAddressNumber
};