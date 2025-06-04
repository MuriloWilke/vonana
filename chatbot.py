import os
import json
import requests
from flask import Flask, request, jsonify
from google.cloud import dialogflow
from dotenv import load_dotenv

load_dotenv()

# Configurations
PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT_ID')
if not PROJECT_ID:
    raise ValueError("A variável de ambiente GOOGLE_CLOUD_PROJECT_ID não está configurada.")

# Using the sender's WhatsApp phone number as the Dialogflow Session ID
SESSION_ID_PREFIX = 'whatsapp'

DIALOGFLOW_LOCATION = os.getenv('DIALOGFLOW_LOCATION', 'global')

VERIFY_TOKEN = os.getenv('VERIFY_TOKEN')
if not VERIFY_TOKEN:
     raise ValueError("The environment variable VERIFY_TOKEN is not configured.")

WHATSAPP_API_URL = os.getenv('WHATSAPP_API_URL')
if not WHATSAPP_API_URL:
    raise ValueError("The environment variable WHATSAPP_API_URL is not configured.")

WHATSAPP_ACCESS_TOKEN = os.getenv('WHATSAPP_ACCESS_TOKEN')
if not WHATSAPP_ACCESS_TOKEN:
    raise ValueError("The environment variable WHATSAPP_ACCESS_TOKEN is not configured.")

WHATSAPP_PHONE_NUMBER_ID = os.getenv('WHATSAPP_PHONE_NUMBER_ID')
if not WHATSAPP_PHONE_NUMBER_ID:
    raise ValueError("The environment variable WHATSAPP_PHONE_NUMBER_ID is not configured.")

# Dialogflow Client Initialization
session_client = dialogflow.SessionsClient()

# Flask App Configuration
app = Flask(__name__)

# Webhook Route
@app.route('/webhook', methods=['GET', 'POST'])
def webhook():

    print("Webhook request recebido!")
    print(f"Method: {request.method}")
    print(f"Headers: {request.headers}")
    print(f"Data/JSON: {request.data.decode('utf-8')}")

    # Handle GET for verification
    if request.method == 'GET':
        mode = request.args.get('hub.mode')
        token = request.args.get('hub.verify_token')
        challenge = request.args.get('hub.challenge')

        if mode and token:
            if mode == 'subscribe' and token == VERIFY_TOKEN:
                print('WEBHOOK_VERIFIED')
                # Return the received 'challenge' to confirm verification
                return challenge, 200
            else:
                # Tokens do not match or invalid mode
                print('VERIFICATION_FAILED: Invalid token or mode')
                return 'Verification token mismatch', 403

        print('VERIFICATION_FAILED: Missing parameters')
        return 'Missing parameters', 400

    # Handle POST for messages
    elif request.method == 'POST':
        try:
            payload = request.json
            print(json.dumps(payload, indent=2))

            # Look for messages in the payload
            if payload and 'entry' in payload and len(payload['entry']) > 0:
                for entry in payload['entry']:
                    if 'changes' in entry and len(entry['changes']) > 0:
                        for change in entry['changes']:
                            if 'value' in change and 'messages' in change['value']:
                                for message in change['value']['messages']:
                                    if message['type'] == 'text':
                                        incoming_message = message['text']['body']

                                        # Using the phone number as the id
                                        whatsapp_user_id_raw = message['from']

                                        print(f"Mensagem recebida de {whatsapp_user_id_raw}: {incoming_message}")

                                        # Create a unique Session ID for this user in Dialogflow
                                        session_id = whatsapp_user_id_raw.replace('+', '')
                                        dialogflow_session_id = f'{SESSION_ID_PREFIX}-{session_id}'

                                        print(f"Usando Session ID para Dialogflow: {dialogflow_session_id}")

                                        # Send the message to Dialogflow
                                        dialogflow_response_text = detect_intent_text(
                                            project_id=PROJECT_ID,
                                            session_id=dialogflow_session_id,
                                            text=incoming_message,
                                            language_code='pt-BR',
                                            client_id = whatsapp_user_id_raw
                                        )

                                        print(f"Resposta do Dialogflow: {dialogflow_response_text}")
                                        success = send_whatsapp_message(whatsapp_user_id_raw, dialogflow_response_text)
                                        if success:
                                            print("Mensagem enviada de volta via WhatsApp API.")
                                        else:
                                             print("Erro ao enviar mensagem de volta via WhatsApp API.")
            return 'OK', 200

        except Exception as e:
            print(f"Ocorreu um erro processando o webhook: {e}")
            return 'Error processing message', 200

# Function to call Dialogflow's Detect Intent API
def detect_intent_text(project_id, session_id, text, language_code, client_id=None):

    try:
        session_path = session_client.project_location_session_path(
            project_id, DIALOGFLOW_LOCATION, session_id
        )
        print(f"Dialogflow Session Path: {session_path}")

        text_input = dialogflow.TextInput(text=text, language_code=language_code)
        query_input = dialogflow.QueryInput(text=text_input)

        query_params = None

        if client_id:
            # Create the QueryParameters object
            query_params = session.QueryParameters(
                parameters={"whatsappClientId": client_id}
            )
            print(f"Including Query Parameters: {query_params}")

        # Build the DetectIntentRequest.
        request = session.DetectIntentRequest(
            session=session_path,
            query_input=query_input,
            query_params=query_params
        )

        # Call the API with the complete request
        response = session_client.detect_intent(
            request=request
        )

        fulfillment_text = response.query_result.fulfillment_text
        print(f"Dialogflow Response Text: {fulfillment_text}")
        return fulfillment_text if fulfillment_text else "Desculpe, não entendi."

    except Exception as e:
        print(f"Error calling Dialogflow API: {e}")
        return "Desculpe, tive um problema para entender. Pode repetir?"

# Function to send message back using the WhatsApp Business API
def send_whatsapp_message(to_phone_number, message_text):

    # Endpoint to send messages in the WhatsApp Business API
    url = f'{WHATSAPP_API_URL}/{WHATSAPP_PHONE_NUMBER_ID}/messages'

    # Message payload (JSON)
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone_number,
        "type": "text",
        "text": {
            "body": message_text
        }
    }

    # Headers for authentication
    headers = {
        'Authorization': f'Bearer {WHATSAPP_ACCESS_TOKEN}',
        'Content-Type': 'application/json'
    }

    try:
        print(f"Enviando mensagem para {to_phone_number}: {message_text}")
        # Make the POST request to the WhatsApp API
        response = requests.post(url, headers=headers, data=json.dumps(payload))
        response.raise_for_status()

        print(f"WhatsApp API response status: {response.status_code}")
        print(f"WhatsApp API response body: {response.json()}")

        return True

    except requests.exceptions.RequestException as e:
        print(f"Erro ao enviar mensagem via WhatsApp API: {e}")
        return False
    except Exception as e:
        print(f"Erro inesperado ao enviar mensagem WhatsApp: {e}")
        return False

# Running a Flask server locally
if __name__ == '__main__':
    print("Rodando Flask app...")
    app.run(debug=True, port=5000)
