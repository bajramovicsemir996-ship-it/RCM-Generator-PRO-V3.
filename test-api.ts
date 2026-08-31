import { getGeminiClient } from "./services/geminiService";
const ai = getGeminiClient();
ai.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: 'Hello'
}).then(res => console.log("Success:", res.text)).catch(e => console.error("Error:", e.message, e.status));
