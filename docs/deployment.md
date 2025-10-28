# Deployment Guide

This document outlines options for running the Screenshot Comparison Tool in different environments, along with configuration checklists and environment variable references.

## Environment Variables

| Variable       | Purpose                                                                    | Default                     |
| -------------- | ---------------------------------------------------------------------------- | --------------------------- |
| `API_HOST`     | Hostname/interface for the API server or proxy target                       | `localhost`                 |
| `API_PORT`     | Port number for the API server                                              | `5001`                      |
| `API_TARGET`   | Full base URL for proxied requests (overrides host/port when provided)       | `http://<host>:<port>`      |
| `VITE_API_HOST`| Hostname injected into the UI build for API routing                         | inherits from `API_HOST`    |
| `VITE_API_PORT`| Port injected into the UI build for API routing                             | inherits from `API_PORT`    |
| `VITE_API_TARGET`| Full base URL injected into the UI build (overrides host/port)            | inherits from `API_TARGET`  |

Set the `VITE_` variants when building the UI bundle so the front end targets the correct API at runtime. For local development with Vite's dev server you can export these values before running `npm run ui:dev`.

---

## Scenarios

### 1. Local Development

**Goal:** Run both the API and UI locally with hot reloading.

1. Ensure dependencies are installed and browsers prepared:
   ```bash
   npm install
   npm run setup
   ```
2. Start the API:
   ```bash
   API_HOST=localhost API_PORT=5001 npm run api:start
   ```
3. In another terminal, start the Vite dev server:
   ```bash
   VITE_API_TARGET=http://localhost:5001 npm run ui:dev
   ```

The UI proxy forwards `/api` and `/artifacts` requests to the local API. Adjust port numbers if 5001/5173 conflict with other services.

### 2. Production with Reverse Proxy (Nginx)

**Goal:** Serve the static UI and forward API requests through an Nginx reverse proxy with TLS termination.

1. Build the UI bundle:
   ```bash
   VITE_API_TARGET=https://example.com/api npm run ui:build
   ```
2. Deploy the API service on an internal port, e.g. 5001:
   ```bash
   API_HOST=0.0.0.0 API_PORT=5001 node src/server.js
   ```
3. Configure Nginx:
   ```nginx
   server {
     listen 443 ssl;
     server_name example.com;

     ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
     ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

     location / {
       root /var/www/screenshot-ui;
       try_files $uri /index.html;
     }

     location /api/ {
       proxy_pass http://127.0.0.1:5001/api/;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }

     location /artifacts/ {
       proxy_pass http://127.0.0.1:5001/artifacts/;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```
4. Host the UI bundle (from `ui/dist`) in `/var/www/screenshot-ui`.

### 3. Direct Hosting (No Reverse Proxy)

**Goal:** Run the API and serve static assets directly from Node (suitable for basic deployments or staging).

1. Pre-build the UI bundle:
   ```bash
   VITE_API_TARGET=http://0.0.0.0:5001 npm run ui:build
   ```
2. Configure a static file server (for example `serve` or Express static middleware) to host `ui/dist`.
3. Launch the API with public bindings:
   ```bash
   API_HOST=0.0.0.0 API_PORT=5001 API_TARGET=http://0.0.0.0:5001 node src/server.js
   ```
4. Expose port 5001 (configure firewall or load balancer) and ensure TLS is handled at the infrastructure layer.

---

## Operations Checklist

- [ ] Confirm API and UI ports are free and documented (default API port 5001, Vite dev port 5173).
- [ ] Verify TLS certificates when terminating HTTPS (reverse proxy or load balancer).
- [ ] Configure proxy headers (`Host`, `X-Forwarded-For`, `X-Forwarded-Proto`) so the API can reconstruct original request context.
- [ ] Set environment variables consistently for both build-time (Vite) and runtime (Node) environments.
- [ ] Monitor disk usage of the screenshots output directory; enforce retention if reports accumulate.
- [ ] Ensure Playwright dependencies are installed on production hosts via `npm run setup` or pre-built Docker images.

---

## Example Environment Files

### `.env.development`
```
API_HOST=localhost
API_PORT=5001
API_TARGET=http://localhost:5001
VITE_API_TARGET=http://localhost:5001
```

### `.env.production`
```
API_HOST=0.0.0.0
API_PORT=5001
API_TARGET=http://127.0.0.1:5001
VITE_API_TARGET=https://example.com/api
```

Adjust the values to match your infrastructure (load balancer hostnames, ports, and TLS settings).
