# Frontend to Backend Integration Audit

## Executive Summary

This document audits all localStorage usage across the three main dashboards and provides a comprehensive plan to replace localStorage fallbacks with proper backend API calls.

---

## 1. localStorage Usage Audit

### CustomerDashboard.tsx (24 instances)

#### Critical Data Storage (Needs API Integration)

1. **`pending_bookings`** (Lines: 394, 882, 1124, 1127, 1217, 1339, 1429, 1444, 1795, 1802)
   - **Purpose**: Stores bookings awaiting backend sync
   - **API Replacement**: `GET /api/orders`, `POST /api/orders`
   - **Priority**: 🔴 HIGH - Core booking functionality

2. **`autospf_sales_cache`** (Lines: 1145, 1146)
   - **Purpose**: Caches sales totals
   - **API Replacement**: `GET /api/orders` (calculate from orders)
   - **Priority**: 🟡 MEDIUM - Can be calculated from API data

3. **`autospf_avatar_{userId}`** (Lines: 623, 932)
   - **Purpose**: Caches user avatar
   - **API Replacement**: `GET /api/users/profile`
   - **Priority**: 🟢 LOW - Performance optimization

4. **`autospf_pending_profile_{userId}`** (Lines: 1677, 1688, 1695)
   - **Purpose**: Stores pending profile updates
   - **API Replacement**: `PATCH /api/users/profile`
   - **Priority**: 🟡 MEDIUM - Profile sync

#### Configuration Storage (Can Stay in localStorage)

5. **`autospf_membership_discount`** (Line: 366)
   - **Purpose**: Stores membership discount rate
   - **API Source**: `GET /api/settings`
   - **Action**: Fetch from API, cache in localStorage for performance

6. **`autospf_token`** (Lines: 511, 874)
   - **Purpose**: Authentication token
   - **Action**: ✅ Keep in localStorage (standard practice)

7. **`autospf_scan_progress`** (Lines: 1005, 1245, 1277, 1284)
   - **Purpose**: Tracks 3D scan progress
   - **Action**: ✅ Keep in localStorage (UI state only)

8. **`SERVICES_CACHE_KEY`** (Lines: 825, 850)
   - **Purpose**: Caches available services
   - **API Source**: `GET /api/services`
   - **Action**: Fetch from API, cache in localStorage for performance

---

### AdminDashboard.tsx (9 instances)

#### Critical Data Storage (Needs API Integration)

1. **`pending_bookings`** (Line: 318)
   - **Purpose**: Reads pending bookings for stats
   - **API Replacement**: `GET /api/orders?status=pending`
   - **Priority**: 🔴 HIGH - Dashboard stats

2. **`autospf_sales_cache`** (Lines: 327, 329, 555)
   - **Purpose**: Caches sales totals
   - **API Replacement**: `GET /api/orders` (calculate from orders)
   - **Priority**: 🟡 MEDIUM - Can be calculated from API data

#### Configuration Storage (Can Stay in localStorage)

3. **`autospf_theme`** / **`autospf_global_theme`** (Lines: 103, 105, 110, 111, 1214, 1215)
   - **Purpose**: Stores UI theme preference
   - **API Source**: `GET /api/settings`
   - **Action**: Fetch from API, cache in localStorage for instant load

4. **`autospf_currency`** (Line: 1210)
   - **Purpose**: Stores currency setting
   - **API Source**: `GET /api/settings`
   - **Action**: Fetch from API, cache in localStorage

5. **`autospf_membership_discount`** (Line: 1211)
   - **Purpose**: Stores membership discount rate
   - **API Source**: `GET /api/settings`
   - **Action**: Fetch from API, cache in localStorage

6. **`autospf_inventory_threshold`** (Line: 1212)
   - **Purpose**: Stores low stock threshold
   - **API Source**: `GET /api/settings`
   - **Action**: Fetch from API, cache in localStorage

7. **`autospf_token`** (Lines: 456, 819, 877)
   - **Purpose**: Authentication token
   - **Action**: ✅ Keep in localStorage (standard practice)

---

### DetailerDashboard.tsx (5 instances)

#### Critical Data Storage (Needs API Integration)

1. **`pending_bookings`** (Lines: 95, 174, 200, 830)
   - **Purpose**: Stores bookings for detailer queue
   - **API Replacement**: `GET /api/orders/detailer/my-orders`
   - **Priority**: 🔴 HIGH - Core detailer functionality

#### Configuration Storage (Can Stay in localStorage)

2. **`autospf_inventory_threshold`** (Line: 216)
   - **Purpose**: Stores low stock threshold
   - **API Source**: `GET /api/settings`
   - **Action**: Fetch from API, cache in localStorage

---

## 2. Available Backend API Routes

### Orders/Bookings API

```
GET    /api/orders                    - Get all orders
GET    /api/orders/:id                - Get order by ID
POST   /api/orders                    - Create new order
PUT    /api/orders/:id                - Update order
PATCH  /api/orders/:id                - Partial update order
DELETE /api/orders/:id                - Delete order

GET    /api/jobs/active               - Get active/in-progress jobs
GET    /api/orders/detailer/my-orders - Get detailer's assigned orders

PUT    /api/orders/:id/assign         - Assign detailer (Admin)
PUT    /api/orders/:id/progress       - Update order progress (Detailer)
PUT    /api/orders/:id/status         - Update customer status (Detailer)

POST   /api/orders/:id/waiver         - Sign waiver (Customer)
POST   /api/orders/:id/inspection     - Upload inspection (Detailer)
POST   /api/orders/:id/rating         - Submit rating (Customer)
```

### Settings API (Assumed - Need to verify)

```
GET    /api/settings                  - Get system settings
PATCH  /api/settings                  - Update system settings (Admin)
```

### Users API (Assumed - Need to verify)

```
GET    /api/users/profile             - Get user profile
PATCH  /api/users/profile             - Update user profile
```

---

## 3. Status Management Audit

### Current Status Values in Use

#### Frontend Statuses

**CustomerDashboard.tsx:**
- `'pending'` - Initial booking state
- `'confirmed'` - Booking confirmed
- `'assigned'` - Detailer assigned
- `'in-progress'` - Work started
- `'processing'` - Work in progress
- `'finishing'` - Final inspection
- `'ready'` - Ready for pickup
- `'completed'` - Job completed
- `'cancelled'` - Booking cancelled

**DetailerDashboard.tsx:**
- `'pending'` - Awaiting start
- `'assigned'` - Assigned to detailer
- `'in-progress'` - Currently working
- `'processing'` - Work in progress
- `'finishing'` - Final inspection
- `'ready'` - Ready for pickup
- `'completed'` - Job completed

**AdminDashboard.tsx:**
- Uses same statuses as above

#### Payment Statuses

- `'paid'` - Payment completed
- `'pending'` - Payment pending
- `'failed'` - Payment failed

#### Customer-Facing Statuses

- `'queued'` - In queue
- `'in-progress'` - Being worked on
- `'finishing'` - Final touches
- `'ready'` - Ready for pickup

### ⚠️ Status Inconsistencies Found

1. **Multiple "in-progress" variants**: `'in-progress'` vs `'processing'`
2. **Unclear transitions**: When does `'finishing'` become `'ready'`?
3. **Backend vs Frontend**: Need to verify backend uses same statuses

---

## 4. Integration Plan

### Phase 1: Global Error Handler (Priority 1)

**File**: `autospf/src/lib/api.ts`

```typescript
// Add global error interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;
    
    // Display toast notification
    if (status === 404) {
      toast.error(`Not Found: ${message}`);
    } else if (status === 500) {
      toast.error(`Server Error: ${message}`);
    } else if (status === 401) {
      toast.error('Unauthorized. Please login again.');
      // Redirect to login
    } else if (status === 403) {
      toast.error('Access Denied');
    } else {
      toast.error(`Error: ${message}`);
    }
    
    return Promise.reject(error);
  }
);
```

### Phase 2: Replace localStorage with API Calls

#### CustomerDashboard.tsx

**Replace `pending_bookings` localStorage:**

```typescript
// OLD: localStorage.getItem('pending_bookings')
// NEW: API call
const loadBookings = async () => {
  try {
    const response = await api.get('/orders');
    if (response.data.success) {
      setBookings(response.data.data);
    }
  } catch (error) {
    // Error handled by global interceptor
    console.error('Failed to load bookings:', error);
  }
};
```

**Replace booking creation:**

```typescript
// OLD: localStorage.setItem('pending_bookings', ...)
// NEW: API call
const createBooking = async (bookingData) => {
  try {
    const response = await api.post('/orders', bookingData);
    if (response.data.success) {
      toast.success('Booking created successfully!');
      loadBookings(); // Refresh list
    }
  } catch (error) {
    // Error handled by global interceptor
  }
};
```

#### AdminDashboard.tsx

**Replace `pending_bookings` reads:**

```typescript
// OLD: JSON.parse(localStorage.getItem('pending_bookings') || '[]')
// NEW: API call
const loadPendingBookings = async () => {
  try {
    const response = await api.get('/orders?status=pending');
    if (response.data.success) {
      setPendingBookings(response.data.data);
    }
  } catch (error) {
    console.error('Failed to load pending bookings:', error);
  }
};
```

#### DetailerDashboard.tsx

**Replace `pending_bookings` with detailer-specific API:**

```typescript
// OLD: localStorage.getItem('pending_bookings')
// NEW: API call
const loadDetailerJobs = async () => {
  try {
    const response = await api.get('/orders/detailer/my-orders');
    if (response.data.success) {
      setJobs(response.data.data);
    }
  } catch (error) {
    console.error('Failed to load detailer jobs:', error);
  }
};
```

### Phase 3: Unified Status Management

**Create status constants file:**

```typescript
// autospf/src/constants/statuses.ts

export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in-progress',
  FINISHING: 'finishing',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
} as const;

export const CUSTOMER_STATUS = {
  QUEUED: 'queued',
  IN_PROGRESS: 'in-progress',
  FINISHING: 'finishing',
  READY: 'ready',
} as const;

// Status transition rules
export const STATUS_TRANSITIONS = {
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.ASSIGNED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.ASSIGNED]: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.IN_PROGRESS]: [ORDER_STATUS.FINISHING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.FINISHING]: [ORDER_STATUS.READY, ORDER_STATUS.IN_PROGRESS],
  [ORDER_STATUS.READY]: [ORDER_STATUS.COMPLETED],
  [ORDER_STATUS.COMPLETED]: [],
  [ORDER_STATUS.CANCELLED]: [],
};
```

### Phase 4: Hybrid Approach (localStorage as Cache)

For performance, keep localStorage as a cache but always sync with backend:

```typescript
const loadBookingsWithCache = async () => {
  // 1. Load from cache immediately (fast UI)
  const cached = localStorage.getItem('bookings_cache');
  if (cached) {
    setBookings(JSON.parse(cached));
  }
  
  // 2. Fetch from API (authoritative source)
  try {
    const response = await api.get('/orders');
    if (response.data.success) {
      const bookings = response.data.data;
      setBookings(bookings);
      // Update cache
      localStorage.setItem('bookings_cache', JSON.stringify(bookings));
    }
  } catch (error) {
    // If API fails, keep using cached data
    console.error('API failed, using cached data:', error);
  }
};
```

---

## 5. Implementation Checklist

### Immediate Actions (Priority 1)

- [ ] Implement global error handler in `api.ts`
- [ ] Create status constants file
- [ ] Verify backend API routes exist and work
- [ ] Test error handling with Toast notifications

### Core Integration (Priority 2)

- [ ] Replace `pending_bookings` in CustomerDashboard
- [ ] Replace `pending_bookings` in AdminDashboard
- [ ] Replace `pending_bookings` in DetailerDashboard
- [ ] Implement booking creation API calls
- [ ] Implement booking update API calls

### Status Management (Priority 3)

- [ ] Import status constants in all dashboards
- [ ] Replace hardcoded status strings
- [ ] Implement status transition validation
- [ ] Ensure backend uses same status values

### Performance Optimization (Priority 4)

- [ ] Implement hybrid cache approach
- [ ] Add loading states for API calls
- [ ] Add retry logic for failed requests
- [ ] Implement optimistic UI updates

### Testing (Priority 5)

- [ ] Test booking creation flow
- [ ] Test booking status updates
- [ ] Test error scenarios (404, 500)
- [ ] Test offline behavior
- [ ] Test cache invalidation

---

## 6. Risk Assessment

### High Risk

🔴 **Breaking existing demo flow**: The demo booking (`#DEMO-SUCCESS-2026`) relies heavily on localStorage  
**Mitigation**: Keep demo bypass logic, only replace real bookings with API calls

🔴 **Data loss during migration**: Users with pending bookings in localStorage  
**Mitigation**: Implement migration script to sync localStorage bookings to backend

### Medium Risk

🟡 **Performance degradation**: API calls slower than localStorage  
**Mitigation**: Implement hybrid cache approach

🟡 **Backend API not ready**: Some endpoints might not exist  
**Mitigation**: Verify all endpoints before starting, create missing ones if needed

### Low Risk

🟢 **Status inconsistencies**: Frontend and backend use different status values  
**Mitigation**: Create unified status constants, update both frontend and backend

---

## 7. Rollback Plan

If integration causes issues:

1. **Keep localStorage fallback**: Wrap API calls in try-catch, fall back to localStorage on error
2. **Feature flag**: Add `USE_API` flag to toggle between localStorage and API
3. **Gradual rollout**: Start with one dashboard, verify, then move to others

---

## 8. Success Criteria

✅ All bookings stored in backend database  
✅ No critical data in localStorage (except auth token)  
✅ Error handling displays Toast notifications  
✅ Status values consistent across frontend and backend  
✅ Demo flow still works  
✅ Performance acceptable (< 500ms for API calls)  
✅ Offline behavior graceful (shows cached data)  

---

**Audit Date:** 2026-02-10  
**Status:** 📋 Planning Phase  
**Next Step:** Implement global error handler
