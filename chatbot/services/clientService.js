async function ensureClientExistsAndAddressSaved(db, whatsappClientId, providedAddress) {
  if (!providedAddress) {
    console.error(`Invalid address provided for client ${whatsappClientId}:`, providedAddress);
    throw new Error("Valid address required to ensure client profile.");
  }

  const clientDocRef = db.collection('clients').doc(whatsappClientId);
  const clientDocSnapshot = await clientDocRef.get();

  if (!clientDocSnapshot.exists) {
    console.log(`Creating new client ${whatsappClientId} with address.`);
    const newClientData = { shippingAddress: providedAddress };
    await clientDocRef.set(newClientData);
    return newClientData;
  }

  const clientData = clientDocSnapshot.data();
  const savedAddress = clientData.shippingAddress;

  if (providedAddress !== savedAddress) {
    console.log(`Updating address for client ${whatsappClientId}`);
    const updatedData = { shippingAddress: providedAddress, lastUpdated: new Date() };
    await clientDocRef.update(updatedData);
    return { ...clientData, ...updatedData };
  }

  console.log(`Address up-to-date for client ${whatsappClientId}`);
  return clientData;
}

module.exports = { 
  ensureClientExistsAndAddressSaved 
};