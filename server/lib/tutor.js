const { Assistant } = require('./assistant');
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * TutorAssistant is an extension of the Assistant class that specializes in
 * providing educational content with synchronized whiteboard actions
 */
class TutorAssistant extends Assistant {
  /**
   * @param {string} instructions - Instructions to give your tutor assistant.
   * @param {object} [options] - Options to give your assistant.
   */
  constructor(instructions, options = {}) {
    // Include the base tutor prompt
    const tutorInstructions = `${TUTOR_SYSTEM_PROMPT}\n\n${instructions}`;
    
    // Ensure voice settings are optimized for tutoring
    const tutorOptions = {
      ...options,
      // Add speech rate control to slow down TTS for better comprehension
      voiceSettings: {
        speed: 0.85, // Slightly slower than default
        stability: 0.7,
        similarity_boost: 0.8
      }
    };
    
    super(tutorInstructions, tutorOptions);
    
    // Store topic information
    this.topic = options.topic || "General Topic";
    this.lessonGenerated = false;
  }
  
  /**
   * Generate a response and parse it for whiteboard actions
   * @param {object[]} conversation - Chat conversation to create a response for.
   */
  async createResponse(conversation) {
    // If this is our first response and we haven't generated a lesson yet,
    // create a detailed lesson plan with timestamped actions
    if (!this.lessonGenerated) {
      console.log(`Generating new lesson for topic: ${this.topic}`);
      
      // Create a detailed lesson prompt
      const detailedPrompt = [
        { 
          role: "system", 
          content: DETAILED_LESSON_PROMPT 
        },
        { 
          role: "user", 
          content: `Create a detailed interactive lesson on: "${this.topic}". Be sure to include proper timestamps and whiteboard actions that work with the format.` 
        }
      ];
      
      try {
        const detailedResponse = await openai.chat.completions.create({
          model: this.llmModel,
          messages: detailedPrompt,
          temperature: 0.7,
          max_tokens: 2500, // Increase token limit for more detailed lessons
        });
        
        const content = detailedResponse.choices[0].message.content;
        console.log("Lesson plan generated successfully");
        
        // Mark that we've generated a lesson so we don't regenerate it
        this.lessonGenerated = true;
        
        // Save the lesson to the conversation history
        this.history.push({ 
          role: "assistant", 
          content: content
        });
        
        return {
          content,
          selectedTool: undefined,
        };
      } catch (error) {
        console.error("Error generating lesson plan:", error);
        return {
          content: "I'm sorry, I encountered an error preparing your lesson. Let's try a simpler approach. What specific aspect of this topic would you like to learn about?",
          selectedTool: undefined,
        };
      }
    }
    
    // For subsequent messages, handle as normal conversation
    const prompt = [...this.history];
    
    if (conversation.length > this.history.length) {
      // Add the new messages to the prompt
      const newMessages = conversation.slice(this.history.length);
      prompt.push(...newMessages);
      
      // Process the user's question and generate a response
      const response = await openai.chat.completions.create({
        model: this.llmModel,
        messages: prompt,
        temperature: 0.7,
        max_tokens: 1000,
      });

      let content = response.choices[0].message.content;
      
      // Check for ending the call
      let selectedTool = undefined;
      if (content.includes("[endCall]")) {
        content = content.replace("[endCall]", "");
        selectedTool = "endCall";
      }

      return {
        content,
        selectedTool,
      };
    } else {
      // No new messages, just return the last assistant message
      const lastAssistantMessage = this.history.filter(msg => msg.role === 'assistant').pop();
      return {
        content: lastAssistantMessage?.content || "What would you like to learn about?",
        selectedTool: undefined,
      };
    }
  }
  
  /**
   * Override textToSpeech to provide more natural speech with appropriate pauses
   */
  async textToSpeech(content) {
    // Add strategic pauses between sentences to make speech more natural
    // Look for timestamps and insert pauses
    const processedContent = content
      .replace(/\[(\d{2}):(\d{2})\]/g, (match, min, sec) => {
        // Replace timestamps with empty string for TTS
        return "";
      })
      .replace(/\.\s+/g, ". <break time=\"0.5s\"/> ") // Add pauses after periods
      .replace(/\?\s+/g, "? <break time=\"0.5s\"/> ") // Add pauses after questions
      .replace(/\!\s+/g, "! <break time=\"0.5s\"/> ") // Add pauses after exclamations
      
      // Remove action tags for speech
      .replace(/\{[^}]+\}/g, "");
    
    // Call the parent textToSpeech with our processed content
    const result = await super.textToSpeech(processedContent);
    return result;
  }
}

// Tutor system prompt - enhanced for better clarity and natural teaching flow
const TUTOR_SYSTEM_PROMPT = `You are an AI tutor designed to teach complex topics in a simple, engaging way.
Your responses will be read aloud while performing synchronized actions on a whiteboard.

FORMAT YOUR RESPONSES WITH:
1. Timestamped sentences: [MM:SS] Your explanation text.
2. Whiteboard actions in curly braces:
   - {write: "text to write in handwritten style"}
   - {draw:rectangle}, {draw:circle}, {draw:arrow}, {draw:line}
   - {highlight: "text to highlight"}
   - {erase: "area description"}
   - {newpage: "page title"}

TEACHING GUIDELINES:
- Break complex topics into clear steps
- Use visual aids: diagrams, graphs, equations
- Synchronize your speech and whiteboard actions precisely
- Label important sections for easy reference
- Check understanding periodically with questions
- Be friendly, patient, and encouraging
- When interrupted with questions, highlight relevant parts to re-explain
- Speak naturally with appropriate pauses and conversational tone
- Use clear, concise language and avoid technical jargon unless necessary

EXAMPLE FORMAT:
[00:00] Welcome to our lesson on integration by substitution.
[00:05] {write: "Integration by Substitution"}
[00:10] This technique helps us solve complex integrals by making a substitution.
[00:15] {write: "Step 1: Identify u"}
[00:20] The first step is to identify which part of the expression to substitute.
[00:25] {draw:rectangle}
[00:28] Inside this rectangle, we'll place our selected "u" variable.

IMPORTANT:
- The timestamp [MM:SS] format is crucial - maintain consistent timing with ~5 seconds between actions
- Actions MUST be synchronized with your speech - explain what you're writing or drawing as you do it
- Be engaging and conversational, as if teaching in person
- Use simple language and build up complexity gradually
- Make sure timestamps increase logically (don't go backwards or make huge jumps)`;

// Detailed lesson prompt - improved for better timing and structure
const DETAILED_LESSON_PROMPT = `You are an expert AI tutor who creates detailed, interactive lessons. 
Your lesson will be delivered through a voice interface synchronized with a whiteboard that can display text, shapes, and highlights.

Your task is to create a comprehensive lesson that includes:
1. An introduction to the topic (about 30 seconds)
2. Step-by-step explanation with visual aids (about 3-4 minutes)
3. Examples that illustrate key concepts (about 2-3 minutes)
4. Check-in questions to verify understanding (about 1 minute)
5. A brief summary at the end (about 30 seconds)

Each line of your response MUST begin with a timestamp in the format [MM:SS] and should include whiteboard actions in curly braces where appropriate:

Whiteboard actions:
- {write: "text"} - Write text on the whiteboard
- {draw:rectangle}, {draw:circle}, {draw:arrow}, {draw:line} - Draw shapes
- {highlight: "text"} - Highlight existing text
- {erase: "description"} - Erase part of the board
- {newpage: "title"} - Start a new whiteboard page

IMPORTANT FORMATTING RULES:
1. EVERY line must start with a timestamp [MM:SS]
2. Speech and actions must be synchronized (mention what you're writing as you write it)
3. Start with [00:00] and increase timestamps by 5-10 seconds between actions (be consistent and realistic)
4. Use conversational language as if speaking directly to a student
5. For mathematics, use proper notation (∫, d/dx, etc.)
6. Include 2-3 check-in questions throughout the lesson where you pause to verify understanding
7. Keep your total lesson length to about 7-8 minutes (timestamps up to approximately [08:00])

EXAMPLE FORMAT:
[00:00] Hello and welcome to our lesson on integration by substitution!
[00:05] {write: "Integration by Substitution"}
[00:10] Today we're going to learn a powerful technique that helps solve complex integrals.
[00:15] {write: "Step 1: Identify u"}
[00:20] The first step is identifying which part of the expression to substitute.
[00:25] {draw:rectangle}
[00:30] Let's look at an example to make this clearer.

Make your explanations thorough but concise, focusing on clarity and understanding rather than covering every detail of the topic.`;

module.exports = { TutorAssistant };