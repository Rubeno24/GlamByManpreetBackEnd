require("dotenv").config(); // Load environment variables
const { Pool } = require("pg");
const cors = require("cors");
const helmet = require("helmet");
const supabase = require("./src/config/supabaseClient.js");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const twilio = require("twilio"); // Import Twilio SDK
const mailgun = require("mailgun-js"); // Import Mailgun

const express = require("express");
const app = express(); // Correct initialization


// Initialize PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Configure Mailgun
const mg = mailgun({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: process.env.MAILGUN_DOMAIN,
});

// Configure Twilio
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === "production" },
  })
);

// Middleware setup
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(helmet());

// ********************************************
// Function to send SMS
// ********************************************
function sendSMS(phoneNumber, message) {
  client.messages
    .create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    })
    .then((msg) => console.log(`SMS sent: ${msg.sid}`))
    .catch((err) => console.error(`Error sending SMS: ${err.message}`));
}

// Function to send email
async function sendEmail(email, subject, message) {
  const data = {
    from: process.env.MAILGUN_SENDER_EMAIL,
    to: email,
    subject: subject,
    text: message,
  };

  try {
    const body = await mg.messages().send(data);
    console.log("Email sent:", body);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

// ********************************************
// Route to handle inquiry submission
// ********************************************
app.post("/submit", async (req, res) => {
  const {
    firstNameAndLastName,
    phoneNumber,
    emailAddress,
    eventDate,
    eventTime,
    eventType,
    eventName,
    clientsHairAndMakeup,
    clientsHairOnly,
    clientsMakeupOnly,
    locationAddress,
    additionalNotes,
  } = req.body;

  try {
    const { data: clientData, error: clientError } = await supabase
      .from("clients_dev")
      .insert([{ name: firstNameAndLastName, email: emailAddress, phone: phoneNumber }])
      .select("id");

    if (clientError || !clientData.length) throw new Error(clientError.message);

    const { error: bookingError } = await supabase.from("bookings_dev").insert([
      {
        client_id: clientData[0].id,
        event_date: eventDate,
        event_time: eventTime,
        event_type: eventType,
        event_name: eventName,
        hair_and_makeup: clientsHairAndMakeup,
        hair_only: clientsHairOnly,
        makeup_only: clientsMakeupOnly,
        location: locationAddress,
        additional_notes: additionalNotes,
      },
    ]);

    if (bookingError) throw new Error(bookingError.message);

    sendSMS(phoneNumber, "Your request has been submitted successfully!");
    await sendEmail(
      emailAddress,
      "Request Submitted",
      `Dear ${firstNameAndLastName}, your request for ${eventName} has been submitted successfully.`
    );

    res.status(201).send("Data inserted successfully");
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Error inserting data");
  }
});

// ********************************************
// Route to handle login
// ********************************************
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data: user, error } = await supabase
      .from("accounts_dev")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) return res.status(401).send("Invalid email or password");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).send("Invalid email or password");

    req.session.userId = user.id;
    res.status(200).json({ message: "Login successful", userId: user.id, firstName: user.firstname });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error during login");
  }
});

// ********************************************
// Route to read clients from the database
// ********************************************
app.get("/clients", async (req, res) => {
  try {
    const { data, error } = await supabase.from("clients_dev").select("*");

    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    console.error("Error retrieving clients:", err);
    res.status(500).send("Error retrieving clients");
  }
});

// ********************************************
// Route to read bookings from the database
// ********************************************
app.get("/bookings", async (req, res) => {
  try {
    const { data: bookings, error } = await supabase.from("bookings_dev").select("*");

    if (error) throw new Error(error.message);
    res.json(bookings);
  } catch (err) {
    console.error("Error retrieving bookings:", err);
    res.status(500).send("Error retrieving bookings");
  }
});

// ********************************************
// Route to delete a client
// ********************************************
app.delete("/clients/:id", async (req, res) => {
  const clientId = req.params.id;

  try {
    const { error } = await supabase.from("clients_dev").delete().eq("id", clientId);

    if (error) throw new Error(error.message);
    res.status(200).send("Client deleted successfully");
  } catch (err) {
    console.error("Error deleting client:", err);
    res.status(500).send("Error deleting client");
  }
});

// Start the server
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
