const axios = require('axios');

/**
 * Fetches an address from a CEP using the ViaCEP API.
 * @param {string} cep The CEP to look up.
 * @returns {object} A standardized address object, similar to @sys.location.
 */
async function getAddressFromCEP(cep) {
  const cleanedCep = cep.replace(/\D/g, '');

  if (cleanedCep.length !== 8) {
    throw new Error("CEP inválido. Por favor, forneça um CEP com 8 dígitos.");
  }

  try {
    const response = await axios.get(`https://viacep.com.br/ws/${cleanedCep}/json/`);
    const data = response.data;

    if (data.erro) {
      throw new Error("CEP não encontrado. Por favor, tente novamente.");
    }

    const standardizedAddress = {
      "country": "",
      "city": data.localidade || "",
      "admin-area": data.uf || "",
      "business-name": "",
      "street-address": data.logradouro || "",
      "zip-code": data.cep || "",
      "shortcut": "",
      "island": "",
      "subadmin-area": data.bairro || "" 
    };

    return standardizedAddress;

  } catch (error) {
    console.error("Erro ao buscar CEP no ViaCEP:", error.message);
    throw new Error(error.message || "Não foi possível buscar o CEP.");
  }
}

module.exports = { getAddressFromCEP };