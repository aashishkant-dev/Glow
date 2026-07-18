# Glow Debugging & Monitoring Guide

A comprehensive guide for debugging MongoDB, Redis, and the entire Glow application stack.

---

## Table of Contents
1. [Quick Health Checks](#quick-health-checks)
2. [MongoDB Debugging](#mongodb-debugging)
3. [Redis Debugging](#redis-debugging)
4. [API Performance Monitoring](#api-performance-monitoring)
5. [Common Human Errors](#common-human-errors)
6. [Important Queries](#important-queries)
7. [Debugging Workflow](#debugging-workflow)

---

## Quick Health Checks

### Check API Health
```bash
curl https://api.glow.app/health
# Expected: {"status":"ok","service":"glow-api"}
```

### Check MongoDB in Server Logs
Look for these messages in **Render Dashboard → Logs**:
```
✔ MongoDB connected          # ← Good! MongoDB is working
✘ MongoDB connection failed # ← Bad! Check MONGODB_URI
```

### Check Redis in Server Logs
Look for these messages in **Render Dashboard → Logs**:
```
✔ Redis connected           # ← Good! Redis is working
⚠️ REDIS_URL not set       # ← Warning! Caching disabled (set REDIS_URL in Render env vars)
⚠️ Redis connection failed # ← Warning! Check REDIS_URL format
📦 Cache HIT: admin:providers   # ← Good! Cached data being used
📦 Cache SET: providers:available # ← Normal on first request
```

### Check Redis Status Manually
```bash
# From any terminal with redis-cli installed:
redis-cli -u YOUR_REDIS_URL ping

# Example:
redis-cli -u "redis://default:AV/xxxxx@global-xxxxx.upstash.io" ping
# Expected: PONG
```
```bash
# From server shell:
redis-cli -u YOUR_REDIS_URL ping
# Expected: PONG
```

---

## MongoDB Debugging

### Connect to MongoDB Atlas

**Option 1: MongoDB Compass (Recommended)**
1. Open MongoDB Compass
2. Connection string: `mongodb+srv://glow:<password>@glow.dejttj7.mongodb.net/test`
3. Replace `<password>` with your actual password

**Option 2: Mongo Shell**
```bash
mongosh "mongodb+srv://glow.dejttj7.mongodb.net/glow" --username glow
```

**Option 3: Atlas Console**
1. Go to https://cloud.mongodb.com
2. Click "Connect" → "Compass"
3. Copy connection string

### Check Collection Indexes
```javascript
// In MongoDB Compass Mongo Shell or mongosh:

// User collection
db.users.getIndexes()
// Should have: role_1_isVerified_1, role_1_createdAt_1, rating_-1

// Booking collection  
db.bookings.getIndexes()
// Should have: location_2dsphere, customerId_1_status_1, providerId_1_status_1

// ProviderProfile collection
db.providerprofiles.getIndexes()
// Should have: userId_1, approvedByAdmin_1_availability_1
```

### Slow Query Analysis
```javascript
// Enable profiler
db.setProfilingLevel(2)

// Wait for slow queries, then check
db.system.profile.find({ millis: { $gt: 100 } }).sort({ ts: -1 }).limit(10)

// Turn off profiler when done
db.setProfilingLevel(0)
```

### Explain Query Performance
```javascript
// Example: Explain a booking query
db.bookings.find({ customerId: ObjectId("USER_ID"), status: "ACCEPTED" })
  .explain("executionStats")
```

---

## Redis Debugging

### Verify Redis is Working

**From your application server:**
```bash
# If ioredis is installed
node -e "
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
redis.ping().then(r => console.log('Redis:', r)).catch(e => console.error(e));
"
```

**From local machine:**
```bash
# Install redis-cli
brew install redis  # macOS
# or
sudo apt install redis-tools  # Ubuntu

# Test connection
redis-cli -u redis://default:PASSWORD@ENDPOINT.upstash.io ping
# Expected: PONG
```

### Check Redis Data
```bash
# List all keys
redis-cli -u YOUR_REDIS_URL KEYS "*"

# Check specific key
redis-cli -u YOUR_REDIS_URL GET "admin:providers:all"

# Check key TTL (time to live)
redis-cli -u YOUR_REDIS_URL TTL "admin:providers:all"

# Monitor real-time commands
redis-cli -u YOUR_REDIS_URL MONITOR
```

### Redis in Application Code
```javascript
// Check if Redis is being used
// Look in src/utils/cache.js

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.log('⚠️ REDIS_URL not set - caching disabled');
}
```

---

## API Performance Monitoring

### Response Time Testing

**Test from terminal:**
```bash
# Test /providers/available (cached endpoint)
time curl -s "https://api.glow.app/providers/available" | head -c 200

# Test /admin/providers (cached endpoint)
time curl -s "https://api.glow.app/admin/providers" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" | head -c 200
```

**Expected Times:**
- First request (cache miss): 200-500ms
- Subsequent requests (cache hit): 10-50ms
- MongoDB-only (no cache): 300-2000ms

### Check Caching in Response Headers
```bash
# First call (cold)
curl -i "https://api.glow.app/providers/available"

# Second call (should be faster)
curl -i "https://api.glow.app/providers/available"
```

### Log Analysis on Render

1. Go to **Render Dashboard** → Your Service → **Logs**
2. Look for these patterns:
   ```
   ✔ MongoDB connected
   ```
   ```
   Cache HIT: admin:providers:all
   ```
   ```
   Cache MISS: providers:available
   ```

---

## Common Human Errors

### 1. Wrong Environment Variable
**Problem:** `REDIS_URL` not set or wrong format
```
Error: getaddrinfo ENOTFOUND your-endpoint.upstash.io
```
**Fix:** Check `REDIS_URL` in Render environment variables. Must be:
```
redis://default:YOUR_PASSWORD@ENDPOINT.upstash.io
```

### 2. MongoDB Connection String Wrong
**Problem:** Using local MongoDB URI in production
**Fix:** Use Atlas URI: `mongodb+srv://glow:...@glow.dejttj7.mongodb.net`

### 3. Forgetting to Invalidate Cache
**Problem:** Changes don't show after updating data
**Fix:** After any write operation, call `cacheDel()` for relevant keys

### 4. Cache Key Mismatch
**Problem:** Different keys for same data
**Fix:** Use consistent key naming: `entity:filter:value`

### 5. Token Expired
**Problem:** "Invalid or expired token" error
**Fix:** User needs to re-login. JWT expires after 7 days.

### 6. Role Not Authorized
**Problem:** "Forbidden: insufficient role" error
**Fix:** Check user's role in MongoDB: `db.users.findOne({_id: ObjectId("ID")}).role`

### 7. Missing Indexes (Slow Queries)
**Problem:** Queries take 5+ seconds
**Fix:** Ensure indexes exist (see indexes section above)

---

## Important Queries

### User Management

```javascript
// Find user by phone
db.users.findOne({ phone: "+1234567890" })

// Find user by ID
db.users.findOne({ _id: ObjectId("USER_ID") })

// Find all Providers
db.users.find({ role: "Provider" })

// Find all customers
db.users.find({ role: "CUSTOMER" })

// Find admin users
db.users.find({ role: "ADMIN" })

// Update user verification
db.users.updateOne(
  { _id: ObjectId("USER_ID") },
  { $set: { isVerified: true } }
)

// Count users by role
db.users.aggregate([
  { $group: { _id: "$role", count: { $sum: 1 } } }
])
```

### Provider Profile Management

```javascript
// Find Provider profile by user ID
db.providerprofiles.findOne({ userId: ObjectId("USER_ID") })

// Find all approved Providers
db.providerprofiles.find({ approvedByAdmin: true })

// Find available Providers
db.providerprofiles.find({ 
  approvedByAdmin: true, 
  availability: true 
})

// Update Provider approval status
db.providerprofiles.updateOne(
  { userId: ObjectId("USER_ID") },
  { $set: { approvedByAdmin: true } }
)

// Add submitted document
db.providerprofiles.updateOne(
  { userId: ObjectId("USER_ID") },
  { $push: { 
    submittedDocuments: {
      docType: "police_check",
      label: "Police Check",
      dataUrl: "data:image/png;base64,...",
      submittedAt: new Date(),
      verifiedByAdmin: false
    }
  }}
)
```

### Booking Management

```javascript
// Find booking by ID
db.bookings.findOne({ _id: ObjectId("BOOKING_ID") })

// Find bookings by customer
db.bookings.find({ customerId: ObjectId("CUSTOMER_ID") })

// Find bookings by Provider
db.bookings.find({ providerId: ObjectId("Provider_ID") })

// Find active bookings for a Provider
db.bookings.find({ 
  providerId: ObjectId("Provider_ID"),
  status: { $in: ["ACCEPTED", "ON_MY_WAY", "STARTED"] }
})

// Find bookings by status
db.bookings.find({ status: "REQUESTED" })

// Find bookings by date range
db.bookings.find({
  scheduledAt: {
    $gte: new Date("2026-01-01"),
    $lte: new Date("2026-12-31")
  }
})

// Update booking status
db.bookings.updateOne(
  { _id: ObjectId("BOOKING_ID") },
  { $set: { status: "ACCEPTED" } }
)

// Cancel booking
db.bookings.updateOne(
  { _id: ObjectId("BOOKING_ID") },
  { 
    $set: { status: "CANCELLED", cancelledBy: "CUSTOMER" }
  }
)

// Count bookings by status
db.bookings.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
])
```

### Message Management

```javascript
// Find messages for a booking
db.messages.find({ bookingId: ObjectId("BOOKING_ID") })
  .sort({ createdAt: -1 })

// Find unread messages for a booking
db.messages.find({ 
  bookingId: ObjectId("BOOKING_ID"),
  read: false,
  senderRole: "Provider"  // messages from Provider to customer
})

// Mark message as read
db.messages.updateMany(
  { bookingId: ObjectId("BOOKING_ID") },
  { $set: { read: true } }
)
```

### Document Management

```javascript
// Find all documents
db.documents.find()

// Find documents by status
db.documents.find({ status: "PENDING" })

// Find documents by Provider
db.documents.find({ providerId: ObjectId("Provider_ID") })

// Update document status
db.documents.updateOne(
  { _id: ObjectId("DOC_ID") },
  { $set: { status: "APPROVED", verifiedByAdmin: true } }
)
```

### Audit Logs (Admin Actions)

```javascript
// Find all audit logs
db.auditlogs.find().sort({ createdAt: -1 }).limit(50)

// Find logs by admin
db.auditlogs.find({ adminId: ObjectId("ADMIN_ID") })

// Find logs by action
db.auditlogs.find({ action: "PROVIDER_APPROVED" })

// Find logs for specific entity
db.auditlogs.find({ entityId: ObjectId("Provider_ID") })
```

### Analytics Queries

```javascript
// Total revenue (completed bookings)
db.bookings.aggregate([
  { $match: { status: "COMPLETED", paymentStatus: "PAID" } },
  { $group: { _id: null, total: { $sum: "$price" } } }
])

// Revenue by day
db.bookings.aggregate([
  { $match: { status: "COMPLETED" } },
  { $group: { 
    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
    total: { $sum: "$price" },
    count: { $sum: 1 }
  }},
  { $sort: { _id: -1 } }
])

// Average rating
db.users.aggregate([
  { $match: { role: "Provider", rating: { $gt: 0 } } },
  { $group: { _id: null, avgRating: { $avg: "$rating" } } }
])

// Provider with most jobs
db.bookings.aggregate([
  { $match: { status: "COMPLETED" } },
  { $group: { _id: "$providerId", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 }
])
```

---

## Debugging Workflow

### Step 1: Verify Server is Running
```bash
curl https://api.glow.app/health
```

### Step 2: Check MongoDB
```bash
# In server logs, look for:
# ✔ MongoDB connected
```

### Step 3: Check Redis
```bash
# If REDIS_URL is set, caching is enabled
# Check cache keys exist:
redis-cli -u YOUR_REDIS_URL KEYS "*"
```

### Step 4: Test Specific Endpoint
```bash
# With authentication
curl -s "https://api.glow.app/ENDPOINT" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Step 5: Check Server Logs
1. Go to **Render Dashboard**
2. Click on your service
3. Click **Logs**
4. Look for error patterns

### Step 6: Test from MongoDB Shell
```javascript
// Verify data exists
db.users.countDocuments()  // Should be > 0
db.bookings.countDocuments()
db.providerprofiles.countDocuments()
```

---

## Timing Benchmarks

| Operation | Cold (no cache) | Warm (cached) |
|-----------|------------------|---------------|
| GET /providers/available | 300-800ms | 20-50ms |
| GET /providers/nearby | 400-1000ms | 30-80ms |
| GET /admin/providers | 200-600ms | 10-40ms |
| POST /bookings | 500-1500ms | N/A (no cache) |
| GET /bookings/my | 100-300ms | N/A (no cache) |

---

## Environment Variables Reference

| Variable | Required | Example |
|----------|----------|---------|
| `PORT` | Yes | 3000 |
| `MONGODB_URI` | Yes | `mongodb+srv://glow:...` |
| `JWT_SECRET` | Yes | 64-char random string |
| `REDIS_URL` | No | `redis://default:...@...upstash.io` |
| `STRIPE_SECRET_KEY` | No | `sk_test_...` |
| `TWILIO_ACCOUNT_SID` | No | `AC...` |
| `TWILIO_AUTH_TOKEN` | No | `...` |
| `CORS_ORIGIN` | No | `*` |
| `HOURLY_RATE` | No | 25 |
| `NEARBY_RADIUS_KM` | No | 15 |

---

## Quick Commands Reference

```bash
# Health check
curl https://api.glow.app/health

# Test Provider endpoint
curl "https://api.glow.app/providers/available" \
  -H "Authorization: Bearer TOKEN"

# Test booking creation
curl -X POST "https://api.glow.app/bookings" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"serviceType":"Personal Care","hours":3,"location":{"coordinates":[-80.5,46.5]},"scheduledAt":"2026-05-01T10:00:00Z"}'
```

---

## Troubleshooting Quick Fixes

| Problem | Quick Fix |
|---------|-----------|
| Slow queries | Check indexes exist, add Redis |
| "Connection refused" | Check MONGODB_URI in Render |
| "Invalid token" | User needs to re-login |
| "Forbidden" | Check user role in MongoDB |
| Cache not working | Verify REDIS_URL is set |
| Data not updating | Check cache invalidation code |
| Socket disconnecting | Check server logs, restart server |

---

*Last Updated: April 2026*
*For questions: support@glow.app*