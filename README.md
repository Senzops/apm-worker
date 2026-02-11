# **@senzops/apm-worker**

The official Serverless & Worker SDK for **Senzor APM**.

Designed specifically for **Cloudflare Workers**, **Cloudflare Pages**, and modern Edge runtimes.

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
import Senzor from "@senzops/apm-worker";

// 1. Initialize (Global Scope)
// Tip: You can also initialize inside the handler if you need to use `env.API_KEY`
Senzor.init({
  apiKey: "sz_apm_...",
});

export default {
  // 2. Wrap the fetch handler
  fetch: Senzor.worker(async (request, env, ctx) => {
    // ✅ This fetch is AUTOMATICALLY traced!
    // It will appear as a child span in the waterfall.
    const user = await fetch("https://api.example.com/user/1");

    // ✅ Manual spans are also easy (and automatically nested)
    const dbSpan = Senzor.startSpan("database_query", "db");
    // await db.query(...)
    dbSpan.end();

    return new Response("Hello World!");
  }),
};
```

## **📋 Production Checklist**

### **1. Environment Variables**

For security, do not commit your API key.

1. Run `npx wrangler secret put SENZOR_API_KEY`.
2. Update your worker to initialize lazily:

```typescript
import Senzor from "@senzops/apm-worker";

letisInitialized = false;

export default {
  fetch: Senzor.worker(async (request, env, ctx) => {
    // Lazy Init with Environment Variable
    if (!isInitialized) {
      Senzor.init({ apiKey: env.SENZOR_API_KEY });
      isInitialized = true;
    }

    return new Response("OK");
  }),
};
```

### **2. Distributed Tracing**

If your Worker calls other services (like a backend API), this SDK automatically adds the `traceparent` header.
Ensure your backend services (Node.js, Python, Go) are configured to extract this header to see a connected trace from Edge -> Backend.

### **3. Error Tracking**

Any uncaught exception thrown in your handler is automatically captured, logged, and reported to Senzor with the stack trace.

```typescript
// This error will be reported automatically
throw new Error("Something went wrong!");
```
