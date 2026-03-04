async function ensureClientExistsAndAddressSaved(db, whatsappClientId, providedAddress) {
  if (!providedAddress || typeof providedAddress !== 'object' || !providedAddress['admin-area']) {
    console.error(`Objeto de endereço inválido ou estado ausente para o cliente ${whatsappClientId}:`, providedAddress);
    throw new Error("Endereço inválido. Por favor, inclua pelo menos o estado.");
  }

  const validStateForms = ['rio grande do sul', 'rs'];
  const providedStateLower = providedAddress['admin-area'].toLowerCase();

  if (!validStateForms.includes(providedStateLower)) {
    console.warn(`Tentativa de cadastro de endereço fora do RS para o cliente ${whatsappClientId}:`, providedAddress['admin-area']);
    throw new Error("Que pena! No momento, só fazemos entregas no Rio Grande do Sul.");
  }

  const validatedAddress = { ...providedAddress };

  if (!validatedAddress.city) {
    console.warn(`Cidade não fornecida para o cliente ${whatsappClientId}.`);
    throw new Error("Endereço incompleto. Por favor, inclua a cidade.");
  }

  if (!validatedAddress['street-address']) {
    console.warn(`Rua não fornecida para o cliente ${whatsappClientId}.`);
    throw new Error("Endereço incompleto. Por favor, inclua a rua.");
  }

  const clientDocRef = db.collection('clients').doc(whatsappClientId);
  const clientDocSnapshot = await clientDocRef.get();

  if (!clientDocSnapshot.exists) {
    const newClientData = { shippingAddress: providedAddress };
    await clientDocRef.set(newClientData);
    return newClientData;
  }

  const clientData = clientDocSnapshot.data();
  const savedAddress = clientData.shippingAddress;

  if (JSON.stringify(validatedAddress) !== JSON.stringify(savedAddress)) {
    const updatedData = { shippingAddress: validatedAddress, lastUpdated: new Date() };
    await clientDocRef.update(updatedData);
    console.log(`Endereço do cliente ${whatsappClientId} atualizado.`);
    return { ...clientData, ...updatedData };
  }

  return clientData;
}

module.exports = { 
  ensureClientExistsAndAddressSaved 
};