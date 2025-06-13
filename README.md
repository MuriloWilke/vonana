# WhatsApp Order Chatbot & Order Management App

This project is a complete ordering and delivery management system that integrates a WhatsApp chatbot backend with a Flutter-based management app.

---

## Project Overview

### 1 WhatsApp Chatbot (Backend Service)

- Conversational interface for customers to place orders via WhatsApp.
- Uses Dialogflow for natural language understanding.
- Handles order creation, address validation, and pricing logic.
- Stores orders, customers, and settings in Firestore.
- Deployed on Google Cloud Run (serverless).

### 2 Order Management App (Flutter Frontend)

- Allows admins, staff, and delivery personnel to:
  - View, search, and filter orders.
  - Update delivery statuses.
  - Visualize delivery routes (Google Maps integration).
  - Manage pricing, shipping, and app settings.
- Real-time synchronization with Firestore.

---

## Features

### Backend

- Dialogflow integration for WhatsApp conversations
- Firestore database for real-time order storage
- Client address validation and persistence
- Pricing rules with flexible configurations (egg types, shipping, etc.)
- Delivery date scheduling
- Serverless deployment on Google Cloud Run
- Separation of business logic and handlers for maintainability

### Flutter App

- Cross-platform mobile & desktop support (iOS, Android, Web, Desktop)
- Real-time order list with filtering
- Admin panel to adjust prices, shipping, and system settings
- Delivery routes map (Google Maps API)
- Firebase integration for real-time updates
- Responsive and scalable UI

---

## Tech Stack

| Layer        | Technology              |
|--------------|--------------------------|
| Backend      | Node.js (Express + Dialogflow Fulfillment) |
| Database     | Google Firestore (NoSQL, serverless) |
| Cloud        | Google Cloud Run |
| Messaging    | WhatsApp (via Dialogflow CX/ES or WhatsApp Business API) |
| Frontend     | Flutter |
| Maps         | Google Maps API |
| Realtime Sync| Firebase SDK |

---

## Project Structure

### Backend

```
chatbot/
│
├── firebase.json # Firestore configurations
├── Dockerfile # Instructions to the docker container
├── handlers/ # Dialogflow intent handlers (orders, address, etc.)
├── services/ # Core business logic and Firestore interaction
├── utils/ # Helper functions (validation, formatting, etc.)
├── firestore/ # Firestore initialization (Firebase Admin SDK)
├── index.js # Express server entry point (Cloud Run webhook)
├── package.json # Node.js dependencies and scripts
└── server.js # Initializing express webhook
```

### Flutter Frontend

```
app/
│
├── lib/
│ ├── models/ # Data models (Order, Client)
│ ├── firebase_options/ # Firestore and Firebase integration
│ ├── auth_gate/ # Firestore authentication
│ ├── screens/ # UI screens and widgets
│ ├── widgets/ # Especialized widgets
│ └── main.dart # Main entry point
└──  pubspec.yaml # Flutter dependencies
```

---

## Setup Instructions

### Prerequisites

- Google Cloud Project
  - Firestore enabled
  - Cloud Run enabled
  - Dialogflow agent set up
  - WhatsApp Business API account (optional)
- Firebase Admin SDK service account key (for backend)
- Flutter SDK installed (latest stable)

---

### Backend Setup

1. Install dependencies:

```bash
cd backend/
npm install
```

### Author

Murilo Cremonese Wilke
