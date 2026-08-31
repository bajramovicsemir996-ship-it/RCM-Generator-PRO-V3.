import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createServer as createViteServer } from "vite";

function getActiveApiKey(): string | undefined {
  const rawKey =
    process.env.GEMINI_API_KEY ||
    process.env.API_KEY ||
    process.env.VITE_GEMINI_API_KEY;
  if (!rawKey) return undefined;
  const trimmed = rawKey.trim();
  // Remove wrapping quotes if present
  const unquoted = trimmed.replace(/^["']|["']$/g, "").trim();
  return unquoted || undefined;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    const hasKey = !!getActiveApiKey();
    res.json({
      status: "ok",
      apiKeyConfigured: hasKey,
      timestamp: new Date().toISOString(),
    });
  });

  // Proxy Gemini API requests with robust key injection & error guarding
  app.use(
    "/api/gemini",
    (req, res, next) => {
      const apiKey = getActiveApiKey();
      if (!apiKey) {
        return res.status(503).json({
          error: {
            code: 503,
            message:
              "Gemini API key is not configured on the server. Please add GEMINI_API_KEY in Settings > Secrets.",
            status: "UNAVAILABLE",
          },
        });
      }
      next();
    },
    createProxyMiddleware({
      target: "https://generativelanguage.googleapis.com",
      changeOrigin: true,
      pathRewrite: {
        "^/api/gemini": "", // remove /api/gemini prefix
      },
      on: {
        proxyReq: (proxyReq) => {
          proxyReq.removeHeader("x-goog-api-key");
          const apiKey = getActiveApiKey();
          if (apiKey) {
            proxyReq.setHeader("x-goog-api-key", apiKey);
          }
        },
      },
    })
  );

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
