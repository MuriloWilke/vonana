import 'package:flutter/material.dart';

// Firebase imports
import 'package:cloud_firestore/cloud_firestore.dart';

import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

class ValuesScreen extends StatefulWidget {
  const ValuesScreen({super.key, this.title});

  final String? title;

  @override
  State<ValuesScreen> createState() => _ValuesScreenState();
}

class _ValuesScreenState extends State<ValuesScreen> {

  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final String _configDocId = '1';

  // Controllers for text input fields
  late TextEditingController _extraValueController;
  late TextEditingController _jumboValueController;
  late TextEditingController _freeShippingController;
  late TextEditingController _shippingValueController;

  // Variables to hold the current Firestore data
  double? _currentExtraValue;
  double? _currentJumboValue;
  int? _currentFreeShipping;
  double? _currentShippingValue;

  bool _isLoading = true;
  String? _errorMessage;
  final _formKey = GlobalKey<FormState>();

  // Formatter for currency display (Brazilian Portuguese locale)
  final NumberFormat _currencyFormatterUIText = NumberFormat("#,##0.00", "pt_BR");

  // Parses a currency string like "1.234,56" to double 1234.56
  double? _parseCurrency(String text) {
    if (text.isEmpty) return null;
    try {
      // Remove all dots except the last, replace comma with dot to parse double
      String parsableString = text.replaceAll(RegExp(r'\.(?=.*\.)'), '').replaceAll(',', '.');
      return double.tryParse(parsableString);
    } catch (e) {
      return null;
    }
  }

  @override
  void initState() {
    super.initState();
    // Initialize controllers
    _extraValueController = TextEditingController();
    _jumboValueController = TextEditingController();
    _freeShippingController = TextEditingController();
    _shippingValueController = TextEditingController();
    // Fetch the current values from Firestore on start
    _fetchConfigurationValues();
  }

  @override
  void dispose() {
    // Dispose controllers to free resources
    _extraValueController.dispose();
    _jumboValueController.dispose();
    _freeShippingController.dispose();
    _shippingValueController.dispose();
    super.dispose();
  }

  // Fetches configuration values from Firestore
  Future<void> _fetchConfigurationValues() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      // Get document with configuration data
      DocumentSnapshot doc = await _firestore.collection('configurations').doc(_configDocId).get();

      if (doc.exists) {
        Map<String, dynamic> data = doc.data() as Map<String, dynamic>;
        setState(() {

          // Read int values and convert to double by dividing by 100 (cents to currency)
          int? extraValueInt = (data['extraValue'] as num?)?.toInt();
          _currentExtraValue =
          extraValueInt != null ? extraValueInt / 100.0 : null;

          int? jumboValueInt = (data['jumboValue'] as num?)?.toInt();
          _currentJumboValue =
          jumboValueInt != null ? jumboValueInt / 100.0 : null;

          _currentFreeShipping = (data['freeShipping'] as num?)?.toInt();

          int? shippingValueInt = (data['shippingValue'] as num?)?.toInt();
          _currentShippingValue = shippingValueInt != null ? shippingValueInt / 100.0 : null;

          // Populate text controllers with formatted strings for UI display
          _extraValueController.text = _currentExtraValue != null
              ? _currencyFormatterUIText.format(_currentExtraValue)
              : '';
          _jumboValueController.text = _currentJumboValue != null
              ? _currencyFormatterUIText.format(_currentJumboValue)
              : '';
          _freeShippingController.text =
              _currentFreeShipping?.toString() ?? '';
          _shippingValueController.text = _currentShippingValue != null
              ? _currencyFormatterUIText.format(_currentShippingValue)
              : '';
        });
      } else {
        setState(() {
          _errorMessage = 'Documento de configurações não encontrado.';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Erro ao buscar configurações: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  // Saves updated configuration values to Firestore
  Future<void> _saveConfigurationValues() async {

    // Validate form fields first
    if (!_formKey.currentState!.validate()) {
      setState(() => _isLoading = false);
      return;
    }
    if (!mounted) return;

    setState(() {
      _isLoading = true;
    });

    // Data map to hold updates for Firestore
    Map<String, dynamic> dataToUpdate = {};
    bool hasChanges = false;

    // Process Extra Value per dozen eggs
    if (_extraValueController.text.isNotEmpty) {
      final double? newExtraValueDouble = _parseCurrency(_extraValueController.text);

      // Validate new value
      if (newExtraValueDouble == null || newExtraValueDouble < 0) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text('Novo valor unitário para Ovo Extra inválido.')),
          );
          setState(() => _isLoading = false);
        }
        return;
      }
      // Convert to integer cents for storage and update state
      dataToUpdate['extraValue'] = (newExtraValueDouble * 100).round();
      _currentExtraValue = newExtraValueDouble;
      hasChanges = true;
    } else if (_currentExtraValue != null) {
      // If input cleared, set value to 0
      dataToUpdate['extraValue'] = 0;
      _currentExtraValue = 0;
      hasChanges = true;
    }

    // Process Jumbo Eggs value similarly
    if (_jumboValueController.text.isNotEmpty) {
      final double? newJumboValueDouble =
      _parseCurrency(_jumboValueController.text);

      if (newJumboValueDouble == null || newJumboValueDouble < 0) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text('Novo valor unitário para Ovo Jumbo inválido.')),
          );
          setState(() => _isLoading = false);
        }
        return;
      }
      dataToUpdate['jumboValue'] = (newJumboValueDouble * 100).round();
      _currentJumboValue = newJumboValueDouble;
      hasChanges = true;
    } else if (_currentJumboValue != null) {
      dataToUpdate['jumboValue'] = 0;
      _currentJumboValue = 0;
      hasChanges = true;
    }

    // Process Free Shipping threshold (number of dozens)
    if (_freeShippingController.text.isNotEmpty) {
      final int? newFreeShipping = int.tryParse(_freeShippingController.text);

      if (newFreeShipping == null || newFreeShipping < 0) {

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Novo valor para dúzias de frete grátis inválido.')),
          );
          setState(() => _isLoading = false);
        }

        return;
      }
      dataToUpdate['freeShipping'] = newFreeShipping;
      _currentFreeShipping = newFreeShipping;
      hasChanges = true;
    }

    // Process Shipping Value
    if (_shippingValueController.text.isNotEmpty) {
      final double? newShippingValueDouble = _parseCurrency(_shippingValueController.text);

      if (newShippingValueDouble == null || newShippingValueDouble < 0) {

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Novo valor do frete inválido.')),
          );
          setState(() => _isLoading = false);
        }

        return;
      }
      // Convert to integer cents and update state
      dataToUpdate['shippingValue'] = (newShippingValueDouble * 100).round();
      _currentShippingValue = newShippingValueDouble;
      hasChanges = true;
    }

    // Only proceed if there are changes to save
    if (!hasChanges && dataToUpdate.isEmpty) {

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Nenhuma alteração para salvar.')),
        );
        setState(() => _isLoading = false);
      }

      FocusScope.of(context).unfocus();
      return;
    }

    // Additional check if data is empty for some reason
    if (dataToUpdate.isEmpty) {

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Nenhum valor novo ou existente para salvar.')),
        );
        setState(() => _isLoading = false);
      }

      FocusScope.of(context).unfocus();
      return;
    }


    try {
      // Update Firestore document with new values
      await _firestore
          .collection('configurations')
          .doc(_configDocId)
          .update(dataToUpdate);

      // Refresh values after saving
      await _fetchConfigurationValues();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Configurações salvas com sucesso!')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao salvar configurações: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
        FocusScope.of(context).unfocus();
      }
    }
  }

  Widget _buildConfigSectionHeader(String title) {
    return Container(
      width: MediaQuery
          .of(context)
          .size
          .width * 0.95,
      height: 30,
      color: Theme
          .of(context)
          .primaryColor,
      margin: const EdgeInsets.only(top: 20, bottom: 10),
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(left: 10),
        child: Text(
          title,
          style: TextStyle(
            color: Theme
                .of(context)
                .colorScheme
                .onPrimary,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  // Builds a reusable text field widget with label, validation, formatting, and optional current value display
  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    String? currentValueText,
    TextInputType keyboardType = TextInputType.number,
    String? prefixText,
    String? hintText,
    List<TextInputFormatter>? inputFormatters,
    String? Function(String?)? validator,
    TextInputAction? textInputAction,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Shows the current value above the input if provided
          if (currentValueText != null && currentValueText.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 4.0),
              child: Text(
                currentValueText,
                style: TextStyle(
                  fontSize: 16,
                  color: Theme.of(context).hintColor, // Uses theme hint color
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),

          // Actual text form field with decoration and behavior set
          TextFormField(
            controller: controller,
            decoration: InputDecoration(
              labelText: label,
              prefixText: prefixText,
              hintText: hintText ?? '0,00',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8.0),
              ),
              filled: true,
              fillColor: Colors.white,
            ),
            keyboardType: keyboardType,
            inputFormatters: inputFormatters,
            validator: validator,
            style: const TextStyle(color: Colors.black87),
            textInputAction: textInputAction,
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Show loading spinner if loading and no current values are loaded yet
    if (_isLoading && _currentExtraValue == null && _currentJumboValue == null) {
      return const Center(child: CircularProgressIndicator());
    }

    // Show error message with retry button if error exists
    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_errorMessage!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.red, fontSize: 16)),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: _fetchConfigurationValues,
                child: const Text('Tentar Novamente'),
              ),
            ],
          ),
        ),
      );
    }

    return Stack(
      children: [
        // Allows tapping outside inputs to dismiss keyboard
        GestureDetector(
          onTap: () => FocusScope.of(context).unfocus(),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  // Section header for Dozens options
                  _buildConfigSectionHeader('Opções para Dúzias'),

                  // Input for "Novo Valor Ovo Extra" with formatting and validation
                  _buildTextField(
                    controller: _extraValueController,

                    label: 'Novo Valor Ovo Extra',

                    currentValueText: _currentExtraValue != null
                        ? 'Valor Atual Ovo Extra: R\$ ${_currencyFormatterUIText.format(_currentExtraValue)}'
                        : 'Valor Atual Ovo Extra: Não definido',
                    prefixText: 'R\$ ',

                    keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                          RegExp(r'^\d*[,]?\d{0,2}')),
                    ],

                    textInputAction: TextInputAction.next,

                    validator: (value) {
                      if (value == null || value.isEmpty) return null;
                      final val = _parseCurrency(value);
                      if (val == null || val < 0) {
                        return 'Novo valor inválido';
                      }
                      return null;
                    },
                  ),

                  // Input for "Novo Valor Ovo Jumbo"
                  _buildTextField(
                    controller: _jumboValueController,

                    label: 'Novo Valor Ovo Jumbo',

                    currentValueText: _currentJumboValue != null
                        ? 'Valor Atual Ovo Jumbo: R\$ ${_currencyFormatterUIText.format(_currentJumboValue)}'
                        : 'Valor Atual Ovo Jumbo: Não definido',
                    prefixText: 'R\$ ',

                    keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                          RegExp(r'^\d*[,]?\d{0,2}')),
                    ],

                    textInputAction: TextInputAction.next,

                    validator: (value) {
                      if (value == null || value.isEmpty) return null;
                      final val = _parseCurrency(value);
                      if (val == null || val < 0) {
                        return 'Novo valor inválido';
                      }
                      return null;
                    },
                  ),

                  const SizedBox(height: 20),

                  // Section header for Shipping options
                  _buildConfigSectionHeader('Opções para Frete'),

                  // Input for "Novas Dúzias p/ Frete Grátis" - only digits allowed
                  _buildTextField(
                    controller: _freeShippingController,

                    label: 'Novas Dúzias p/ Frete Grátis',

                    currentValueText: _currentFreeShipping != null
                        ? 'Atual: ${_currentFreeShipping} dúzias'
                        : 'Atual: Não definido',

                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                    ],

                    textInputAction: TextInputAction.next,

                    validator: (value) {
                      if (value == null || value.isEmpty) return null;
                      final val = int.tryParse(value);
                      if (val == null || val < 0) {
                        return 'Novo valor inválido';
                      }
                      return null;
                    },
                  ),

                  // Input for "Novo Valor do Frete Padrão"
                  _buildTextField(
                    controller: _shippingValueController,

                    label: 'Novo Valor do Frete Padrão',

                    currentValueText: _currentShippingValue != null
                        ? 'Valor Atual: R\$ ${_currencyFormatterUIText.format(_currentShippingValue)}'
                        : 'Valor Atual: Não definido',
                    prefixText: 'R\$ ',

                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'^\d{0,7}([,]\d{0,2})?$')),
                    ],

                    textInputAction: TextInputAction.done,

                    validator: (value) {
                      if (value == null || value.isEmpty) return null;
                      final val = _parseCurrency(value);
                      if (val == null || val < 0) {
                        return 'Novo valor inválido';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 30),

                  // Button to save the configuration values, disabled if loading
                  ElevatedButton(
                    onPressed: _isLoading
                        ? null
                        : () {
                          // Validate the form before saving
                          if (_formKey.currentState!.validate()) {
                            _saveConfigurationValues();
                          }
                        },

                    child: const Text('Salvar Configurações'),
                  ),

                  const SizedBox(height: 20),
                ],
              ),
            ),
          ),
        ),

        // Show semi-transparent overlay with spinner when loading
        if (_isLoading)
          Container(
            color: Colors.black.withOpacity(0.3),
            child: const Center(
              child: CircularProgressIndicator(),
            ),
          ),
      ],
    );
  }
}