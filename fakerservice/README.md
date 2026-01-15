# Faker Service - High Performance Data Generator

## 🚀 Features

- **Fastify** - High performance HTTP server (~65k req/s)
- **Piscina** - Battle-tested worker thread pool with native abort support
- **JSON Schema Faker** - Generate fake data from JSON Schema
- **Redis** - Distributed abort signal handling
- **LRU Cache** - Schema and result caching

## 📁 Project Structure

```
fakerservice/
├── src/
│   ├── index.js                 # Entry point
│   ├── app.js                   # Fastify app setup
│   │
│   ├── config/
│   │   ├── index.js            # Main config
│   │   ├── security.js         # Security config
│   │   └── cache.js            # Cache config
│   │
│   ├── plugins/
│   │   ├── security.js         # Security middleware
│   │   ├── cors.js             # CORS plugin
│   │   └── errorHandler.js     # Centralized error handler
│   │
│   ├── routes/
│   │   ├── index.js            # Route registration
│   │   ├── generate.js         # /generate endpoint
│   │   ├── validate.js         # /validate endpoint
│   │   ├── health.js           # /health, /metrics
│   │   └── management.js       # /stop-job, /kill-all, /gc
│   │
│   ├── services/
│   │   ├── schemaService.js    # Schema preparation
│   │   ├── generatorService.js # Data generation
│   │   └── jobService.js       # Job tracking
│   │
│   ├── workers/
│   │   ├── pool.js             # Piscina pool
│   │   └── generator.worker.js # Worker thread
│   │
│   ├── utils/
│   │   ├── logger.js           # Logging
│   │   └── helpers.js          # Helpers
│   │
│   └── errors/
│       ├── index.js            # Export all errors
│       ├── AppError.js         # Base error
│       ├── ValidationError.js  # Validation errors
│       └── GenerationError.js  # Generation errors
│
├── package.json
├── Dockerfile
└── README.md
```

## 🔧 Installation

```bash
npm install
```

## 🚀 Running

```bash
# Development
npm run dev

# Production (with GC exposed)
npm run start:gc

# Docker
docker build -t faker-service .
docker run -p 4000:4000 faker-service
```

## 📡 API Endpoints

### POST /generate
Generate fake data from JSON Schema.

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "email": { "type": "string", "format": "email" }
    }
  },
  "count": 1000,
  "streaming": true,
  "batchSize": 500
}
```

### POST /validate
Validate JSON Schema.

```json
{
  "schema": { ... }
}
```

### POST /stop-job/:jobId
Instantly stop a running job.

### GET /health
Health check endpoint.

### GET /metrics
Performance metrics.

### POST /gc
Force garbage collection (requires --expose-gc).

## 🔐 Security

API Key authentication via header:
```
X-API-Key: your-api-key
```

## 🐳 Docker Compose

```yaml
faker-service:
  build: ./fakerservice
  ports:
    - "4000:4000"
  environment:
    - PORT=4000
    - FAKER_API_KEY=mongodb-seeder-internal-key-2026
    - REDIS_URL=redis://redis:6379
    - FAKER_SECURITY_ENABLED=true
  depends_on:
    - redis
```

## 📊 Performance

- **~65k req/s** with Fastify
- **Instant abort** (<1ms) with Piscina
- **Auto-scaling** worker pool based on CPU cores
