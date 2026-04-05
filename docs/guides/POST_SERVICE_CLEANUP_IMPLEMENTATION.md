# Post-Service Cleanup Implementation

## Overview
Implement automatic archiving of completed orders from active bookings to past bookings after service completion, ensuring clean separation between active and historical data.

## Current Backend Implementation

### Existing Archive System

The backend already has an archive system in place:

**File:** `backend/controllers/orderController.js`

```javascript
// Archive field exists in Order model
{
  archived: Boolean,
  archivedAt: Date,
  archivedReason: String
}

// Cleanup function exists (Line 180)
export const cleanupStaleBookings = async (req, res, next) => {
  // Archives stale bookings
  $set: {
    archived: true,
    archivedAt: new Date(),
    archivedReason: 'stale_booking_cleanup',
    status: 'cancelled'
  }
}

// Query filter (Line 144-146)
if (includeArchived !== 'true') {
  query.archived = { $ne: true };
}
```

**API Route:** `POST /api/orders/cleanup-stale` (Admin only)

## Implementation Plan

### 1. Backend Enhancement

#### Add Auto-Archive on Completion

**File:** `backend/controllers/orderController.js`

Add automatic archiving when order status changes to 'completed' or 'ready':

```javascript
// In updateOrderProgress function (around line 1023)
if (order.status === 'completed') {
  // Auto-archive completed orders after 24 hours
  order.archiveScheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
}

// In updateCustomerStatus function (around line 1172)
if (normalizedStatus === 'ready' && order.status === 'completed') {
  // Mark for archiving
  order.readyForArchive = true;
}
```

#### Create Archive Endpoint

**File:** `backend/controllers/orderController.js`

```javascript
/**
 * Archive completed order
 * Moves order from active to past bookings
 */
export const archiveOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    // Only archive completed or cancelled orders
    if (order.status !== 'completed' && order.status !== 'cancelled') {
      return res.status(400).json({ 
        success: false, 
        message: 'Can only archive completed or cancelled orders' 
      });
    }
    
    // Check if already archived
    if (order.archived) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order is already archived' 
      });
    }
    
    // Archive the order
    order.archived = true;
    order.archivedAt = new Date();
    order.archivedReason = 'post_service_cleanup';
    await order.save();
    
    res.json({ 
      success: true, 
      message: 'Order archived successfully',
      data: order 
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get archived orders (past bookings)
 */
export const getArchivedOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const query = { archived: true };
    
    // Filter by user role
    if (req.user.role === 'customer') {
      query.customer = req.user.id;
    } else if (req.user.role === 'detailer') {
      query.detailer = req.user.id;
    }
    
    const orders = await Order.find(query)
      .populate('customer', 'name email phone')
      .populate('detailer', 'name email')
      .populate('service', 'name price')
      .sort({ archivedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const count = await Order.countDocuments(query);
    
    res.json({
      success: true,
      data: orders,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unarchive order (restore to active)
 */
export const unarchiveOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }
    
    if (!order.archived) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order is not archived' 
      });
    }
    
    // Unarchive
    order.archived = false;
    order.archivedAt = undefined;
    order.archivedReason = undefined;
    await order.save();
    
    res.json({ 
      success: true, 
      message: 'Order restored successfully',
      data: order 
    });
  } catch (error) {
    next(error);
  }
};
```

#### Add Routes

**File:** `backend/routes/orders.js`

```javascript
/**
 * @route POST /api/orders/:id/archive
 * @desc Archive completed order
 * @access Private - Admin or order owner
 */
router.post('/:id/archive', orderController.archiveOrder);

/**
 * @route GET /api/orders/archived
 * @desc Get archived orders (past bookings)
 * @access Private
 */
router.get('/archived', orderController.getArchivedOrders);

/**
 * @route POST /api/orders/:id/unarchive
 * @desc Restore archived order to active
 * @access Private - Admin only
 */
router.post('/:id/unarchive', authorize('admin'), orderController.unarchiveOrder);
```

### 2. Frontend Implementation

#### Update Order Service

**File:** `autospf/src/lib/order-service.ts`

```typescript
export const OrderService = {
  // ... existing methods ...
  
  /**
   * Archive completed order
   */
  archiveOrder: async (orderId: string) => {
    try {
      const response = await api.post(`/orders/${orderId}/archive`);
      return response.data;
    } catch (error) {
      console.error('Failed to archive order:', error);
      throw error;
    }
  },
  
  /**
   * Get archived orders (past bookings)
   */
  getArchivedOrders: async (page = 1, limit = 20) => {
    try {
      const response = await api.get('/orders/archived', {
        params: { page, limit }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to get archived orders:', error);
      throw error;
    }
  },
  
  /**
   * Unarchive order (Admin only)
   */
  unarchiveOrder: async (orderId: string) => {
    try {
      const response = await api.post(`/orders/${orderId}/unarchive`);
      return response.data;
    } catch (error) {
      console.error('Failed to unarchive order:', error);
      throw error;
    }
  }
};
```

#### Update CustomerDashboard

**File:** `autospf/src/pages/CustomerDashboard.tsx`

Add "Past Bookings" tab:

```typescript
// Add new tab
const tabs = [
  { id: 'book' as TabType, label: 'Book Service', icon: Calendar },
  { id: 'bookings' as TabType, label: 'My Bookings', icon: ClipboardList },
  { id: 'past' as TabType, label: 'Past Bookings', icon: Archive }, // NEW
  { id: 'profile' as TabType, label: 'Profile', icon: User },
];

// Add state for past bookings
const [pastBookings, setPastBookings] = useState<Booking[]>([]);

// Load past bookings
const loadPastBookings = async () => {
  try {
    const response = await OrderService.getArchivedOrders();
    if (response.success) {
      setPastBookings(response.data);
    }
  } catch (error) {
    console.error('Failed to load past bookings:', error);
  }
};

// Auto-archive completed bookings after pickup
const handleArchiveBooking = async (bookingId: string) => {
  try {
    const response = await OrderService.archiveOrder(bookingId);
    if (response.success) {
      toast.success('Booking archived successfully');
      loadBookings(); // Refresh active bookings
      loadPastBookings(); // Refresh past bookings
    }
  } catch (error) {
    // Error handled by global interceptor
  }
};
```

#### Update AdminDashboard

**File:** `autospf/src/pages/AdminDashboard.tsx`

Add archive management:

```typescript
// Add "Archived Orders" section
const handleBulkArchive = async () => {
  try {
    // Archive all completed orders older than 30 days
    const completedOrders = bookings.filter(b => 
      b.status === 'completed' && 
      new Date(b.completedAt) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
    
    for (const order of completedOrders) {
      await OrderService.archiveOrder(order.id);
    }
    
    toast.success(`Archived ${completedOrders.length} completed orders`);
    loadBookings();
  } catch (error) {
    // Error handled by global interceptor
  }
};
```

### 3. Automatic Archiving Logic

#### Option A: Client-Side Auto-Archive

Archive when customer confirms pickup:

```typescript
const handleConfirmPickup = async (bookingId: string) => {
  try {
    // Update status to picked up
    await OrderService.updateOrder(bookingId, { 
      status: 'completed',
      pickedUpAt: new Date().toISOString()
    });
    
    // Auto-archive after 5 seconds
    setTimeout(async () => {
      await OrderService.archiveOrder(bookingId);
      toast.success('Order moved to past bookings');
    }, 5000);
  } catch (error) {
    // Error handled by global interceptor
  }
};
```

#### Option B: Server-Side Scheduled Archive

Use a cron job to auto-archive:

**File:** `backend/utils/scheduler.js`

```javascript
import cron from 'node-cron';
import Order from '../models/Order.js';

// Run daily at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    // Archive completed orders older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const result = await Order.updateMany(
      {
        status: 'completed',
        completedAt: { $lt: sevenDaysAgo },
        archived: { $ne: true }
      },
      {
        $set: {
          archived: true,
          archivedAt: new Date(),
          archivedReason: 'auto_archive_after_completion'
        }
      }
    );
    
    console.log(`Auto-archived ${result.modifiedCount} completed orders`);
  } catch (error) {
    console.error('Auto-archive failed:', error);
  }
});
```

### 4. UI Components

#### Past Bookings View

```tsx
{activeTab === 'past' && (
  <div className="space-y-4">
    <h2 className="text-2xl font-bold">Past Bookings</h2>
    
    {pastBookings.length === 0 ? (
      <div className="text-center py-12 text-zinc-500">
        <Archive className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>No past bookings</p>
      </div>
    ) : (
      <div className="space-y-4">
        {pastBookings.map((booking) => (
          <Card key={booking.id} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{booking.serviceName}</p>
                  <p className="text-sm text-zinc-400">{booking.vehicleInfo}</p>
                  <p className="text-xs text-zinc-500">
                    Completed: {new Date(booking.completedAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge className="bg-green-500/20 text-green-400">
                  Completed
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )}
  </div>
)}
```

## Implementation Checklist

### Backend
- [ ] Add `archiveOrder` controller function
- [ ] Add `getArchivedOrders` controller function
- [ ] Add `unarchiveOrder` controller function
- [ ] Add routes for archive endpoints
- [ ] Test archive functionality
- [ ] Implement scheduled auto-archive (optional)

### Frontend
- [ ] Create `OrderService.archiveOrder()` method
- [ ] Create `OrderService.getArchivedOrders()` method
- [ ] Add "Past Bookings" tab to CustomerDashboard
- [ ] Add archive button to completed bookings
- [ ] Add bulk archive to AdminDashboard
- [ ] Test archive flow end-to-end

### Testing
- [ ] Test manual archive
- [ ] Test auto-archive after completion
- [ ] Test past bookings view
- [ ] Test unarchive (admin only)
- [ ] Test error handling

## Benefits

✅ **Clean Active View**: Only active bookings shown in main dashboard  
✅ **Historical Records**: Past bookings preserved and accessible  
✅ **Performance**: Faster queries on active bookings  
✅ **Organization**: Clear separation between current and past work  
✅ **Compliance**: Maintains complete booking history  

## Success Criteria

✅ Completed orders automatically archived after 7 days  
✅ Past bookings accessible in separate tab  
✅ Archive/unarchive functionality works correctly  
✅ No data loss during archiving  
✅ Performance improvement on active bookings queries  

---

**Implementation Date:** 2026-02-10  
**Status:** 📋 Ready for Implementation  
**Priority:** 🟡 MEDIUM
