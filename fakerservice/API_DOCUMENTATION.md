# Faker Service API Documentation

## 📋 Table of Contents

- [Overview](#overview)
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Common Response Format](#common-response-format)
- [API Endpoints](#api-endpoints)
  - [Data Generation](#data-generation)
  - [Schema Validation](#schema-validation)
  - [Health & Monitoring](#health--monitoring)
  - [Job Management](#job-management)
  - [System Management](#system-management)

---

## Overview

Faker Service là microservice high-performance để sinh dữ liệu fake từ JSON Schema. Xây dựng trên Fastify + Piscina + JSON Schema Faker.

**Key Features:**
- ⚡ High performance (~65k req/s)
- 🔥 Worker pool với Piscina
- 🛑 Instant job abort (<1ms)
- 📊 Streaming support
- 🔐 API Key authentication
- 📈 Real-time metrics

---

## Base URL

```
http://localhost:4000
```

**Docker:**
```
http://faker-service:4000
```

---

## Authentication

### API Key (Required)

Tất cả endpoints (trừ `/health`) yêu cầu API Key trong header:

```http
X-API-Key: mongodb-seeder-internal-key-2026
```

Hoặc:

```http
Authorization: Bearer mongodb-seeder-internal-key-2026
```

### IP Whitelist

Chỉ cho phép request từ:
- `localhost`, `127.0.0.1`
- Docker internal networks (`172.x.x.x`, `10.x.x.x`)
- Spring Boot backend

---

## Common Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "requestId": "req-1",
  "timestamp": "2026-01-14T14:36:37.000Z"
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Schema is required",
    "details": [ ... ]
  },
  "requestId": "req-1",
  "timestamp": "2026-01-14T14:36:37.000Z"
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `UNAUTHORIZED` | 401 | Missing or invalid API Key |
| `FORBIDDEN` | 403 | IP not in whitelist |
| `GENERATION_ERROR` | 500 | Data generation failed |
| `JOB_ABORTED` | 499 | Job was aborted by user |

---

## API Endpoints

## Data Generation

### POST /generate

Sinh dữ liệu fake từ JSON Schema.

#### Request

**Headers:**
```http
Content-Type: application/json
X-API-Key: mongodb-seeder-internal-key-2026
X-Job-Id: job-12345  (optional - để track và abort)
```

**Body:**

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string", "format": "uuid" },
      "name": { "type": "string", "minLength": 5, "maxLength": 50 },
      "email": { "type": "string", "format": "email" },
      "age": { "type": "integer", "minimum": 18, "maximum": 99 },
      "active": { "type": "boolean" },
      "createdAt": { "type": "string", "format": "date-time" }
    },
    "required": ["id", "name", "email", "age"]
  },
  "count": 1000,
  "validateData": false,
  "randomMode": false,
  "streaming": false,
  "batchSize": 500
}
```

**Parameters:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `schema` | object | Yes* | - | JSON Schema để generate data |
| `schemas` | array | Yes* | - | Mảng nhiều schemas (alternative) |
| `count` | integer | No | 1 | Số lượng records (max: 10M) |
| `validateData` | boolean | No | false | Validate data sau khi generate |
| `randomMode` | boolean | No | false | Thêm random mutations (fuzz testing) |
| `streaming` | boolean | No | false | Streaming mode |
| `batchSize` | integer | No | 500 | Batch size (10-10000) |

*Phải có `schema` hoặc `schemas`

#### Response

**Success (Single Schema):**

```json
{
  "success": true,
  "totalRecordsGenerated": 1000,
  "schemasProcessed": 1,
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "age": 25,
      "active": true,
      "createdAt": "2026-01-14T14:36:37.000Z"
    }
    // ... 999 more records
  ],
  "stats": {
    "recordsGenerated": 1000,
    "duration": 234,
    "recordsPerSecond": 4273
  }
}
```

**Success (Multiple Schemas):**

```json
{
  "success": true,
  "totalRecordsGenerated": 2000,
  "schemasProcessed": 2,
  "results": [
    {
      "collection": "users",
      "data": [ ... ],
      "stats": { ... }
    },
    {
      "collection": "products",
      "data": [ ... ],
      "stats": { ... }
    }
  ]
}
```

#### Examples

**cURL:**

```bash
curl -X POST http://localhost:4000/generate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: mongodb-seeder-internal-key-2026" \
  -d '{
    "schema": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "email": { "type": "string", "format": "email" }
      }
    },
    "count": 10
  }'
```

**JavaScript (Fetch):**

```javascript
const response = await fetch('http://localhost:4000/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'mongodb-seeder-internal-key-2026',
    'X-Job-Id': 'job-12345'
  },
  body: JSON.stringify({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        age: { type: 'integer', minimum: 18, maximum: 99 }
      }
    },
    count: 1000,
    batchSize: 500
  })
});

const data = await response.json();
console.log(data);
```

**Java (Spring RestTemplate):**

```java
RestTemplate restTemplate = new RestTemplate();
HttpHeaders headers = new HttpHeaders();
headers.setContentType(MediaType.APPLICATION_JSON);
headers.set("X-API-Key", "mongodb-seeder-internal-key-2026");
headers.set("X-Job-Id", jobId);

Map<String, Object> request = new HashMap<>();
request.put("schema", schemaObject);
request.put("count", 1000);
request.put("batchSize", 500);

HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);
ResponseEntity<Map> response = restTemplate.postForEntity(
    "http://faker-service:4000/generate",
    entity,
    Map.class
);
```

---

### POST /benchmark

Benchmark hiệu năng generation.

#### Request

```json
{
  "count": 1000,
  "iterations": 3
}
```

#### Response

```json
{
  "benchmark": "complete",
  "config": {
    "count": 1000,
    "iterations": 3
  },
  "results": [
    {
      "iteration": 1,
      "duration": 234,
      "recordsPerSecond": 4273
    },
    {
      "iteration": 2,
      "duration": 228,
      "recordsPerSecond": 4385
    },
    {
      "iteration": 3,
      "duration": 231,
      "recordsPerSecond": 4329
    }
  ],
  "average": {
    "recordsPerSecond": 4329,
    "estimatedFor10K": "2s",
    "estimatedFor100K": "23s",
    "estimatedFor1M": "4min"
  },
  "poolStats": { ... },
  "cacheStats": { ... }
}
```

---

## Schema Validation

### POST /validate

Validate JSON Schema trước khi generate.

#### Request

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "email": { "type": "string", "format": "email" }
    },
    "required": ["name", "email"]
  }
}
```

#### Response

**Valid Schema:**

```json
{
  "success": true,
  "valid": true,
  "message": "Schema is valid",
  "schemaInfo": {
    "type": "object",
    "propertiesCount": 2,
    "requiredFields": ["name", "email"]
  }
}
```

**Invalid Schema:**

```json
{
  "success": false,
  "valid": false,
  "message": "Schema validation failed",
  "errors": [
    {
      "message": "Invalid schema type: invalidType"
    }
  ]
}
```

---

## Health & Monitoring

### GET /health

Health check endpoint (không cần authentication).

#### Response

```json
{
  "status": "healthy",
  "timestamp": "2026-01-14T14:36:37.000Z",
  "uptime": 3600,
  "version": "2.0.0",
  "memory": {
    "heapUsedMB": 125,
    "heapTotalMB": 256,
    "rssMB": 180,
    "externalMB": 5
  },
  "pool": {
    "threads": {
      "min": 10,
      "max": 20,
      "active": 15
    },
    "activeJobs": 3,
    "queueSize": 0
  },
  "redis": {
    "connected": false
  }
}
```

---

### GET /metrics

Chi tiết performance metrics.

#### Response

```json
{
  "timestamp": "2026-01-14T14:36:37.000Z",
  "uptime": 3600,
  "system": {
    "platform": "win32",
    "nodeVersion": "v20.11.0",
    "cpuCores": 20,
    "cpuModel": "Intel(R) Core(TM) i9-12900K",
    "loadAverage": {
      "1min": "0.50",
      "5min": "0.45",
      "15min": "0.40"
    },
    "totalMemoryGB": "64.00",
    "freeMemoryGB": "32.50"
  },
  "process": {
    "pid": 12345,
    "memory": {
      "heapUsedMB": 125,
      "heapTotalMB": 256,
      "rssMB": 180,
      "externalMB": 5,
      "arrayBuffersMB": 2
    }
  },
  "pool": {
    "threads": {
      "min": 10,
      "max": 20,
      "active": 15
    },
    "queue": {
      "waiting": 0,
      "completed": 1234
    },
    "jobs": {
      "active": 3,
      "activeJobIds": ["job-1", "job-2", "job-3"]
    },
    "performance": {
      "totalGenerated": 1000000,
      "completedJobs": 50,
      "abortedJobs": 2,
      "avgRecordsPerSecond": 4500
    },
    "redis": {
      "connected": false
    }
  },
  "cache": {
    "schemaCache": {
      "size": 45,
      "max": 200
    },
    "validatorCache": {
      "size": 23,
      "max": 100
    }
  },
  "activeRequests": {
    "count": 3,
    "requests": [
      {
        "requestId": 123,
        "jobId": "job-1",
        "count": 10000,
        "startTime": 1705244197000,
        "runningTime": 5000
      }
    ]
  }
}
```

---

### GET /ready

Kubernetes readiness probe.

#### Response

```json
{
  "ready": true,
  "threads": 15
}
```

---

### GET /live

Kubernetes liveness probe.

#### Response

```json
{
  "alive": true,
  "timestamp": "2026-01-14T14:36:37.000Z"
}
```

---

## Job Management

### POST /stop-job/:jobId

**INSTANT** stop job đang chạy (<1ms).

#### Request

```
POST /stop-job/job-12345
```

**Headers:**
```http
X-API-Key: mongodb-seeder-internal-key-2026
```

#### Response

```json
{
  "success": true,
  "jobId": "job-12345",
  "aborted": true,
  "message": "Job job-12345 stopped instantly (0ms)",
  "duration": "0ms",
  "details": {
    "poolAborted": true,
    "serviceAborted": true,
    "redisSignalSet": false
  }
}
```

#### Example

**cURL:**

```bash
curl -X POST http://localhost:4000/stop-job/job-12345 \
  -H "X-API-Key: mongodb-seeder-internal-key-2026"
```

**Java (Spring Boot):**

```java
public void stopJob(String jobId) {
    RestTemplate restTemplate = new RestTemplate();
    HttpHeaders headers = new HttpHeaders();
    headers.set("X-API-Key", "mongodb-seeder-internal-key-2026");
    
    HttpEntity<Void> entity = new HttpEntity<>(headers);
    String url = "http://faker-service:4000/stop-job/" + jobId;
    
    ResponseEntity<Map> response = restTemplate.exchange(
        url,
        HttpMethod.POST,
        entity,
        Map.class
    );
    
    log.info("Stop job response: {}", response.getBody());
}
```

---

### GET /requests

List tất cả active requests.

#### Response

```json
{
  "success": true,
  "activeRequests": 3,
  "poolActiveJobs": 3,
  "requests": [
    {
      "requestId": 123,
      "jobId": "job-1",
      "count": 10000,
      "startTime": 1705244197000,
      "runningTime": 5000
    },
    {
      "requestId": 124,
      "jobId": "job-2",
      "count": 5000,
      "startTime": 1705244200000,
      "runningTime": 2000
    }
  ],
  "poolJobs": ["job-1", "job-2", "job-3"]
}
```

---

### POST /kill/:requestId

Kill request bằng internal request ID.

#### Request

```
POST /kill/123
```

#### Response

```json
{
  "success": true,
  "requestId": 123,
  "message": "Request 123 killed"
}
```

---

### POST /kill-all

Kill tất cả active requests.

#### Response

```json
{
  "success": true,
  "message": "Killed 3 requests, 3 pool jobs",
  "details": {
    "serviceKilled": 3,
    "poolKilled": ["job-1", "job-2", "job-3"]
  }
}
```

---

## System Management

### POST /gc

Force garbage collection (yêu cầu `--expose-gc`).

#### Response

```json
{
  "success": true,
  "message": "Garbage collection completed, freed 45MB",
  "memory": {
    "before": {
      "heapUsedMB": 125,
      "heapTotalMB": 256
    },
    "after": {
      "heapUsedMB": 80,
      "heapTotalMB": 256
    },
    "freedMB": 45
  }
}
```

---

### POST /clear-cache

Clear tất cả internal caches.

#### Response

```json
{
  "success": true,
  "message": "Caches cleared",
  "before": {
    "schemaCache": { "size": 45, "max": 200 },
    "validatorCache": { "size": 23, "max": 100 }
  },
  "after": {
    "schemaCache": { "size": 0, "max": 200 },
    "validatorCache": { "size": 0, "max": 100 }
  }
}
```

---

### GET /pool-stats

Worker pool statistics.

#### Response

```json
{
  "success": true,
  "stats": {
    "threads": {
      "min": 10,
      "max": 20,
      "active": 15
    },
    "queue": {
      "waiting": 0,
      "completed": 1234
    },
    "jobs": {
      "active": 3,
      "activeJobIds": ["job-1", "job-2", "job-3"]
    },
    "performance": {
      "totalGenerated": 1000000,
      "completedJobs": 50,
      "abortedJobs": 2,
      "avgRecordsPerSecond": 4500
    }
  }
}
```

---

## JSON Schema Support

### Supported Types

- `string`, `number`, `integer`, `boolean`, `null`
- `object`, `array`

### Supported Formats

| Format | Example |
|--------|---------|
| `email` | john.doe@example.com |
| `uuid` | 550e8400-e29b-41d4-a716-446655440000 |
| `date` | 2026-01-14 |
| `date-time` | 2026-01-14T14:36:37.000Z |
| `uri`, `url` | https://example.com |
| `ipv4` | 192.168.1.1 |
| `ipv6` | 2001:0db8:85a3:0000:0000:8a2e:0370:7334 |

### Supported Constraints

- `minLength`, `maxLength` (string)
- `minimum`, `maximum` (number/integer)
- `minItems`, `maxItems` (array)
- `pattern` (regex)
- `enum` (fixed values)
- `required` (required fields)

### Example Schema

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid"
    },
    "username": {
      "type": "string",
      "minLength": 3,
      "maxLength": 20,
      "pattern": "^[a-zA-Z0-9_]+$"
    },
    "email": {
      "type": "string",
      "format": "email"
    },
    "age": {
      "type": "integer",
      "minimum": 18,
      "maximum": 99
    },
    "status": {
      "type": "string",
      "enum": ["active", "inactive", "pending"]
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "maxItems": 5
    },
    "metadata": {
      "type": "object",
      "properties": {
        "createdAt": { "type": "string", "format": "date-time" },
        "updatedAt": { "type": "string", "format": "date-time" }
      }
    }
  },
  "required": ["id", "username", "email", "age"]
}
```

---

## Performance Tips

### 1. Batch Size Optimization

- **Small records (<100 fields):** `batchSize: 1000`
- **Medium records (100-500 fields):** `batchSize: 500`
- **Large records (>500 fields):** `batchSize: 100`

### 2. Worker Pool Usage

- Requests < 5000 records: Main thread (faster)
- Requests ≥ 5000 records: Worker pool (parallel)

### 3. Caching

- Schema cache: 200 schemas (1 hour TTL)
- Validator cache: 100 validators (30 minutes TTL)
- Reuse schemas để tận dụng cache

### 4. Memory Management

- Sử dụng streaming cho records > 100K
- Call `/gc` sau jobs lớn
- Monitor `/metrics` để track memory

---

## Error Handling

### Common Errors

**400 - Validation Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid schema",
    "details": [
      { "message": "Invalid schema type: invalidType" }
    ]
  }
}
```

**401 - Unauthorized:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing API key"
  }
}
```

**403 - Forbidden:**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied from 192.168.1.100"
  }
}
```

**499 - Job Aborted:**
```json
{
  "success": false,
  "error": {
    "code": "JOB_ABORTED",
    "message": "Job job-12345 was aborted by user",
    "jobId": "job-12345"
  }
}
```

**500 - Generation Error:**
```json
{
  "success": false,
  "error": {
    "code": "GENERATION_ERROR",
    "message": "Failed to generate data",
    "stage": "generation"
  }
}
```

---

## Rate Limiting

Hiện tại **KHÔNG có** rate limiting. Để implement:

1. Thêm `@fastify/rate-limit` vào dependencies
2. Register plugin trong `app.js`
3. Configure limits theo use case

---

## Changelog

### v2.0.0 (2026-01-14)
- ✨ Refactor với Fastify + Piscina
- ⚡ Instant job abort (<1ms)
- 📊 Enhanced metrics
- 🔐 Improved security
- 📁 Modular architecture

### v1.0.0 (Previous)
- Express + Custom WorkerPool
- Basic generation features

---

## Support

**Issues:** Create issue trong GitHub repository  
**Contact:** damkhacquanganh@example.com
