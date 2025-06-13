'use strict';  // Enforce strict mode for safer, cleaner JavaScript

// Import the Express app configured in index.js
const app = require('./index');

// Determine the port to listen on.
// First, try the PORT environment variable.
// Otherwise, default to 8080.
const port = process.env.PORT || 8080;

// Start the HTTP server, binding to the chosen port.
// Once the server is listening, log a confirmation message.
app.listen(port, () => {
  console.log(`Webhook Dialogflow listening on port ${port}`);
});