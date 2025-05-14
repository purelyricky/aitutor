const dotenv = require("dotenv");
dotenv.config();

const WebSocket = require("ws");
const { TutorAssistant } = require("./lib/tutor");

const PORT = process.env.PORT || 8000;

const server = new WebSocket.Server({ port: PORT });

// Create different tutor assistants for different topics
const createTutorAssistant = (topic) => {
  // Default tutor instructions
  let tutorInstructions = `You are a friendly and knowledgeable AI tutor specializing in teaching ${topic}.
    Break down complex concepts into simpler steps.
    Explain clearly and use the whiteboard to visualize key concepts.
    Check understanding periodically with questions.
    If the student interrupts with questions, address them clearly before continuing.`;
  
  // Enhanced instructions for specific topics
  if (topic.toLowerCase().includes("integration") || topic.toLowerCase().includes("calculus")) {
    tutorInstructions = `You are a friendly and knowledgeable AI tutor specializing in calculus, particularly integration techniques.
      You teach in a step-by-step manner that helps students understand the process clearly.
      When explaining integration by substitution:
      1. Show how to identify the substitution variable "u"
      2. Demonstrate how to find "du"
      3. Show the conversion of the integral in terms of u
      4. Calculate the new integral
      5. Substitute back to get the final answer
      
      Use visual aids on the whiteboard to illustrate each step.
      Write out equations clearly with proper mathematical notation.
      Draw diagrams to help visualize the concepts when helpful.
      Emphasize key insights that will help students apply the technique to other problems.`;
  }
  
  return new TutorAssistant(tutorInstructions, {
    topic: topic, // Pass the topic to the tutor assistant
    speakFirstOpeningMessage: `Hello! I'll be your tutor for ${topic} today. Let me prepare a lesson for you!`,
    llmModel: "gpt-3.5-turbo",
    speechToTextModel: "openai/whisper-1",
    voiceModel: "openai/tts-1",
    voiceName: "nova",
    // Add additional parameters to slow down speech slightly for better comprehension
    voiceSettings: {
      speed: 0.85, // Slightly slower than default
      stability: 0.7,
      similarity_boost: 0.8
    }
  });
};

module.exports = { TutorAssistant };

server.on("connection", (ws, req) => {
  const cid = req.headers["sec-websocket-key"];
  ws.binaryType = "arraybuffer";
  
  // Parse query parameters
  const query = req.url.split("?")[1];
  const queryParams = new URLSearchParams(query);
  const topic = queryParams.get("topic") || "General Learning";
  
  console.log(`New connection for topic: ${topic}`);
  
  // Create a tutor assistant based on the selected topic
  const tutorAssistant = createTutorAssistant(topic);
  
  // To have an AI agent talk to the user, create a conversation and begin it
  const conversation = tutorAssistant.createConversation(ws, {
    onEnd: (callLogs) => {
      console.log("----- TUTOR SESSION LOG -----");
      console.log(callLogs);
    },
  });
  
  conversation.begin(1000);
  
  ws.on("close", () => {
    console.log("Client disconnected", cid);
  });
  
  ws.on("error", (error) => {
    console.error(`WebSocket error: ${error}`);
  });
});

console.log(`AI Tutor WebSocket server is running on ws://localhost:${PORT}`);