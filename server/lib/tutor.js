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
    
    super(tutorInstructions, options);
  }
  
  /**
   * Generate a response and parse it for whiteboard actions
   * @param {object[]} conversation - Chat conversation to create a response for.
   */
  async createResponse(conversation) {
    // For tutoring, we'll use a different approach
    // We need longer, more detailed responses with timestamps

    const prompt = [...this.history];
    
    // If this is a regular message, handle accordingly
    if (conversation.length > this.history.length) {
      // Add the new messages to the prompt
      const newMessages = conversation.slice(this.history.length);
      prompt.push(...newMessages);
    }
    
    const response = await openai.chat.completions.create({
      model: this.llmModel,
      messages: prompt,
      temperature: 0.7,
      max_tokens: 1500, // Longer responses for detailed tutorials
    });

    let content = response.choices[0].message.content;
    
    // Process for whiteboard actions if necessary
    // Check if this is the first message and we need to generate a lesson plan
    const isFirstUserMessage = prompt.filter(msg => msg.role === 'user').length === 1;
    
    if (isFirstUserMessage) {
      // For a new topic, generate a detailed lesson with timestamped actions
      const topicName = prompt.find(msg => msg.role === 'user')?.content || 'General Topic';
      
      const detailedPrompt = [
        { 
          role: "system", 
          content: DETAILED_LESSON_PROMPT 
        },
        { 
          role: "user", 
          content: `Create a detailed interactive lesson on: "${topicName}"` 
        }
      ];
      
      const detailedResponse = await openai.chat.completions.create({
        model: this.llmModel,
        messages: detailedPrompt,
        temperature: 0.7,
        max_tokens: 2000, // Very detailed response
      });
      
      content = detailedResponse.choices[0].message.content;
    }
    
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
  }
}

// Tutor system prompt
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

EXAMPLE FORMAT:
[00:00] Welcome to our lesson on integration by substitution.
[00:03] {write: "Integration by Substitution"}
[00:06] This technique helps us solve complex integrals by making a substitution.
[00:10] {write: "Step 1: Identify u"}
[00:13] The first step is to identify which part of the expression to substitute.
[00:17] {draw:rectangle}
[00:19] Inside this rectangle, we'll place our selected "u" variable.

INTERACTION INSTRUCTIONS:
- If the student asks a question, pause your current explanation
- Reference the relevant section by highlighting it
- Provide a clarification
- Resume your original explanation where you left off
- If a student indicates they don't understand, ask which specific part is unclear

MATH NOTATION:
- For integrals, use ∫ symbol
- For derivatives, use d/dx notation
- For fractions, clearly indicate numerator and denominator
- Use superscripts for exponents (e.g., "x^2" or "x²")
- Use proper notation for mathematical operations

IMPORTANT:
- The timestamp [MM:SS] format is crucial - maintain consistent timing with ~3-5 seconds between actions
- Actions MUST be synchronized with your speech - explain what you're writing or drawing as you do it
- Be engaging and conversational, as if teaching in person
- Use simple language and build up complexity gradually`;

// Detailed lesson prompt for generating a full lesson plan
const DETAILED_LESSON_PROMPT = `You are an expert AI tutor who creates detailed, interactive lessons. 
Your lesson will be delivered through a voice interface synchronized with a whiteboard that can display text, shapes, and highlights.

Your task is to create a comprehensive lesson that includes:
1. An introduction to the topic
2. Step-by-step explanation with visual aids
3. Examples that illustrate key concepts
4. Check-in questions to verify understanding
5. A brief summary at the end

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
3. Start with [00:00] and increase timestamps by 3-5 seconds between actions
4. Use conversational language as if speaking directly to a student
5. For mathematics, use proper notation (∫, d/dx, etc.)

EXAMPLE FORMAT:
[00:00] Hello and welcome to our lesson on integration by substitution!
[00:04] {write: "Integration by Substitution"}
[00:08] Today we're going to learn a powerful technique that helps solve complex integrals.
[00:12] {write: "Step 1: Identify u"}
[00:15] The first step is identifying which part of the expression to substitute.
[00:20] {draw:rectangle}
[00:23] Let's look at an example to make this clearer.

Your lesson should be comprehensive enough for a 5-10 minute tutorial. Include enough detail to thoroughly teach the topic while keeping the student engaged.`;

module.exports = { TutorAssistant };