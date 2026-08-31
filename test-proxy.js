import fetch from "node-fetch";
const res = await fetch("http://localhost:3000/api/gemini/v1beta/models/gemini-1.5-flash:generateContent", {
  method: "POST",
  body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] }),
  headers: { "Content-Type": "application/json" }
});
console.log(res.status, await res.text());
