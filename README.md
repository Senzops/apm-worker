# **@senzops/apm-worker**

The official Serverless & Worker SDK for **Senzor APM**.

Designed specifically for **Cloudflare Workers**, **Cloudflare Pages**, **Nitro**, and modern Edge runtimes.

## **✨ Features**

- **Zero-Config Auto-Instrumentation:** Automatically captures all global `fetch` calls.
- **Context Propagation:** Uses `AsyncLocalStorage` (via `nodejs_compat`) to track requests across async boundaries without manual passing.
- **Lightweight:** < 5KB gzip, zero external dependencies.
- **Non-Blocking:** Uses `ctx.waitUntil` to flush data without adding latency to user responses.
- **W3C Trace Context:** Automatically injects `traceparent` headers into outgoing requests for distributed tracing.

## **📦 Installation**

```sh
npm install @senzops/apm-worker
```

## **🚀 Quick Start (Cloudflare Workers)**

### **1. Enable Node Compatibility**

Add the `nodejs_compat` flag to your `wrangler.toml`. This is **required** for the SDK to track context across async `fetch` calls.

```toml
# wrangler.toml
compatibility_flags = [ "nodejs_compat" ]
compatibility_date = "2024-09-23"
```

### **2. Integrate the SDK**

Initialize Senzor in the global scope and wrap your `fetch` handler.

```typescript
import { Senzor } from "@senzops/apm-worker";

Senzor.init({
  apiKey: "sz_apm_...",
});

export default {
  fetch: Senzor.worker(async (request, env, ctx) => {
    return new Response("Hello World!");
  }),
};
```

---

## **⚡ Usage with Nitro / Nuxt**

For **Nitro** (standalone) or **Nuxt**, use a server plugin to instrument the entire application globally without wrapping individual handlers.

### **1. Create a Plugin**

Create `server/plugins/senzor.ts`:

```typescript
import { Senzor } from "@senzops/apm-worker";

export default defineNitroPlugin((nitroApp) => {
  // 1. Initialize
  // Use process.env or runtime config if available
  Senzor.init({
    apiKey: process.env.SENZOR_API_KEY || "sz_apm_...",
  });

  // 2. Register Global Instrumentation
  Senzor.nitroPlugin(nitroApp);
});
```

### **2. Configuration**

Ensure `nodejs_compat` is enabled in your `nitro.config.ts`:

```typescript
// nitro.config.ts
export default defineNitroConfig({
  cloudflare: {
    wrangler: {
      compatibility_flags: ["nodejs_compat"],
    },
  },
});
```

That's it! Every request to your Nitro app is now traced, and any `fetch` calls made within your API routes will automatically appear as spans in the trace.

---

## **📋 Production Checklist**

### **1. Environment Variables**

For security, do not commit your API key.

1. Run `npx wrangler secret put SENZOR_API_KEY`.
2. Update your worker to initialize lazily or use build-time variables.

### **2. Distributed Tracing**

If your Worker calls other services (like a backend API), this SDK automatically adds the `traceparent` header.
Ensure your backend services (Node.js, Python, Go) are configured to extract this header to see a connected trace from Edge -> Backend.

### **3. Error Tracking**

Any uncaught exception thrown in your handler is automatically captured, logged, and reported to Senzor with the stack trace.
