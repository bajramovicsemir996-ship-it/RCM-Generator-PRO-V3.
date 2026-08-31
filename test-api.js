import { getGeminiClient } from "./src/services/geminiService.js";
const ai = getGeminiClient();
ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Hello'
}).then(console.log).catch(console.error);
