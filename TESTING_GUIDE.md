# 🧪 Bahiran Delivery App - Complete Testing Guide

## 📋 Overview

This guide will walk you through testing all features of the Bahiran Delivery application, with special focus on the new **Smart Order Notification System** that only notifies drivers when they're near restaurant locations.

---

## 🏗️ Prerequisites

### 1. Development Environment
```bash
# Ensure you have the latest dependencies
npm install

# Clear cache if needed
npx expo start --clear
```

### 2. Required Permissions
The app requires these permissions to function properly:
- ✅ **Location (Always)** - For background tracking
- ✅ **Notifications** - For order alerts
- ✅ **Foreground Service** - For Android background operation

---

## 🎯 Feature Testing Checklist

### 1️⃣ **Initial Setup & Login**

#### Test Steps:
1. Launch the app
2. Log in with delivery person credentials
3. Verify you land on the home/orders screen

**Expected Results:**
- ✅ Login successful
- ✅ Location permission requested
- ✅ Notification permission requested
- ✅ Database initialized (check logs)

**Logs to verify:**
```
✅ Database initialized
✅ Order notification service initialized
📍 Location tracking started
```

---

### 2️⃣ **Going Online/Offline**

#### Test Steps:
1. Toggle the **Online/Offline** switch in the app
2. Observe status change
3. Try going offline with an active order (should be prevented)

**Expected Results:**
- ✅ When going **ONLINE**:
  ```
  🟢 Going online - starting smart order monitoring
  📥 Synced X orders from database
  🔄 Started monitoring location for pending orders
  ```
- ✅ When going **OFFLINE**:
  ```
  🔴 Going offline - stopping smart order monitoring
  🛑 Stopped monitoring location for pending orders
  ```
- ✅ Cannot go offline with active order

---

### 3️⃣ **Smart Order Notification System** ⭐ (NEW)

This is the core new feature. The app intelligently decides whether to show notifications based on proximity.

#### Test Scenario A: **Driver is NEAR restaurant** (< 5km)

**Setup:**
- Be online
- Position yourself within 5km of a restaurant location
- Have a new order sent to your account via socket/API

**Expected Results:**
1. ✅ Order notification appears **immediately**
2. ✅ Sound plays (if enabled in settings)
3. ✅ Vibration pattern triggers
4. ✅ Modal popup shows with order details
5. ✅ Database logs:
   ```
   📍 New order ORD-XXX: Distance to restaurant = XXXXm
   ✅ Driver is near restaurant (XXXXm) - showing notification
   ```

**Verify in logs:**
```
📦 New delivery order received: ORD-XXX
📍 New order ORD-XXX: Distance to restaurant = 2500m
✅ Driver is near restaurant (2500m) - showing notification
✅ Order notification shown: order-id-xxx
```

---

#### Test Scenario B: **Driver is FAR from restaurant** (> 5km)

**Setup:**
- Be online
- Position yourself more than 5km away from restaurant
- Have a new order sent to your account

**Expected Results:**
1. ✅ Order is **saved to database** (NOT shown immediately)
2. ✅ No notification/sound/vibration yet
3. ✅ Database logs:
   ```
   📍 New order ORD-XXX: Distance to restaurant = 8500m
   💾 Driver is far from restaurant (8500m) - saving to database
   ```

**Verify in logs:**
```
📦 New delivery order received: ORD-XXX
📍 New order ORD-XXX: Distance to restaurant = 8500m
💾 Driver is far from restaurant (8500m) - saving to database
```

---

#### Test Scenario C: **Driver moves closer to restaurant**

**Setup:**
- Have orders saved from Scenario B (driver was far)
- Start moving towards the restaurant location
- Wait 30 seconds between location updates (monitoring interval)

**Expected Results:**
1. ✅ App continuously monitors location (every 30 seconds)
2. ✅ When you get within 5km, notification triggers automatically
3. ✅ Modal popup appears
4. ✅ Database logs:
   ```
   📍 Driver is now near restaurant for order ORD-XXX (4200m)!
   ✅ Order notification shown: order-id-xxx
   ```

**Verify in logs:**
```
📍 Checking pending orders against current location...
📍 Driver is now near restaurant for order ORD-XXX (4200m)!
✅ Order notification shown: order-id-xxx
🗑️ Removed order ORD-XXX from pending list
```

---

### 4️⃣ **Accepting Orders**

#### Test Steps:
1. Receive an order notification (either immediate or proximity-triggered)
2. Click **Accept** button
3. Observe state changes

**Expected Results:**
- ✅ Order accepted via socket
- ✅ Order removed from pending list
- ✅ Order added to active orders
- ✅ Toast notification: "✅ Order ORD-XXX accepted!"
- ✅ Database logs:
  ```
  🗑️ Removed order order-id-xxx from smart order service
  ```

**Verify in logs:**
```
Accepting delivery order: order-id-xxx
✅ Order accepted successfully
🗑️ Removed order order-id-xxx from smart order service
```

---

### 5️⃣ **Declining Orders**

#### Test Steps:
1. Receive an order notification
2. Click **Decline** button
3. Observe state changes

**Expected Results:**
- ✅ Modal closes
- ✅ Order removed from pending list
- ✅ Toast: "Order declined"
- ✅ Database logs:
  ```
  🗑️ Removed declined order order-id-xxx from smart order service
  ```

**Verify in logs:**
```
Declining delivery order
🗑️ Removed declined delivery order order-id-xxx from smart order service
```

---

### 6️⃣ **Background Operation**

#### Test Steps:
1. Accept an active order
2. **Lock your phone screen** (screen off)
3. **Open another app** (WhatsApp, browser, etc.)
4. **Minimize the app**
5. Wait for location updates

**Expected Results:**
- ✅ Location tracking continues in background
- ✅ New order notifications still work
- ✅ Proximity monitoring still runs
- ✅ Sound and vibration work even with screen off

**Verify in logs (use ADB or console):**
```
📍 Background location update
📍 Checking pending orders against current location...
```

---

### 7️⃣ **Database Persistence**

#### Test Steps:
1. Have some pending orders (driver far from restaurant)
2. **Close the app completely** (swipe away from recent apps)
3. **Reopen the app**
4. Go online

**Expected Results:**
- ✅ Database loads saved orders
- ✅ Monitoring resumes for saved orders
- ✅ Database logs:
  ```
  📥 Synced X orders from database
  ```

**Verify in logs:**
```
✅ Database initialized
📥 Synced 3 orders from database
🔄 Started monitoring location for pending orders
```

---

### 8️⃣ **Multiple Orders Handling**

#### Test Steps:
1. Have multiple orders sent while driver is far (> 5km from all)
2. All orders should be saved to database
3. Move towards one restaurant
4. Only that restaurant's order should notify

**Expected Results:**
- ✅ Multiple orders saved
- ✅ Only orders within 5km threshold trigger notifications
- ✅ Each order is checked independently

---

### 9️⃣ **Edge Cases Testing**

#### Test Case A: **No location available**
- Disable GPS
- Receive order
- **Expected:** Order saved to database (no crash)

#### Test Case B: **No restaurant location in order**
- Receive order with missing/invalid restaurant location
- **Expected:** Notification shown anyway (fallback behavior)

#### Test Case C: **Going offline mid-delivery**
- Have active order
- Try to go offline
- **Expected:** Blocked with warning message

#### Test Case D: **Network interruption**
- Disconnect internet while online
- **Expected:** App handles gracefully, retries connection

---

## 🐛 Debugging Tips

### Check Logs
Use **React Native Debugger** or **Expo Dev Tools** to see real-time logs:
```bash
npx expo start
# Then press 'j' to open debugger
```

### Important Log Patterns:
- `📦 New delivery order received` - Order arrived
- `📍 New order ... Distance to restaurant = XXXXm` - Proximity check
- `✅ Driver is near` - Immediate notification
- `💾 Driver is far` - Saved for later
- `📍 Driver is now near` - Proximity triggered
- `🗑️ Removed order` - Order accepted/declined

### Check Database State
Add this to your code temporarily to inspect database:
```javascript
const stats = await databaseService.getStats();
console.log('📊 Database Stats:', stats);

const activeOrders = await databaseService.getActiveOrders();
console.log('📦 Active Orders:', activeOrders);
```

### Check Smart Order Service State
```javascript
const count = smartOrderService.getPendingOrdersCount();
console.log('📋 Pending orders count:', count);

const orders = smartOrderService.getPendingOrders();
console.log('📋 Pending orders:', orders);
```

---

## 📱 Testing on Real Device vs Emulator

### Emulator Testing
- ✅ Use **Android Studio** emulator location mocking
- ✅ Set location via extended controls (lat/lng)
- ✅ Simulate movement by changing location

### Real Device Testing (Recommended)
- ✅ More accurate GPS data
- ✅ Test actual movement scenarios
- ✅ True background behavior testing
- ✅ Realistic network conditions

**For real device testing:**
```bash
# Build development APK
eas build --profile preview --platform android

# Or use Expo Go
npx expo start
# Scan QR code with Expo Go app
```

---

## 🎯 Key Metrics to Track

### Performance Metrics:
- ⏱️ **Time to show notification**: < 2 seconds
- ⏱️ **Location check interval**: Every 30 seconds
- ⏱️ **Database query time**: < 100ms
- ⏱️ **Proximity threshold**: 5000 meters (5km)

### Success Criteria:
- ✅ 100% of nearby orders (< 5km) show notification
- ✅ 0% of far orders (> 5km) show immediate notification
- ✅ All saved orders trigger when driver approaches
- ✅ No duplicate notifications
- ✅ No crashes or ANR (App Not Responding)

---

## 🚨 Common Issues & Solutions

### Issue 1: Orders not notifying when near
**Solution:** 
- Check location permissions (should be "Always")
- Verify monitoring is started (check "Going online" logs)
- Check proximity threshold (5km default)

### Issue 2: Notifications showing for far orders
**Solution:**
- Verify distance calculation logic
- Check restaurant location data format
- Review logs for distance calculation

### Issue 3: Database not persisting orders
**Solution:**
- Check database initialization logs
- Verify write permissions
- Test `saveOrder()` method directly

### Issue 4: Background monitoring not working
**Solution:**
- Verify foreground service permissions (Android)
- Check battery optimization settings
- Ensure app is not killed by OS

---

## 📞 Test Contacts

### Backend API Testing
- **Initialize Withdraw:** `GET /api/v1/balance/initialize-withdraw`
- **Withdraw:** `POST /api/v1/balance/withdraw`
- **Orders:** Check socket connection for `deliveryMessage` events

### Socket Events to Monitor:
- `deliveryMessage` - New order arrives
- `requestLocationUpdate` - Server requests location
- `orderStatusChanged` - Order status updates

---

## ✅ Final Checklist

Before considering testing complete:

- [ ] Tested immediate notifications (driver near)
- [ ] Tested saved orders (driver far)
- [ ] Tested proximity triggering (driver moves closer)
- [ ] Tested accepting orders
- [ ] Tested declining orders
- [ ] Tested background operation
- [ ] Tested database persistence
- [ ] Tested going online/offline
- [ ] Tested with screen off
- [ ] Tested with other apps open
- [ ] Tested app restart
- [ ] Tested network interruption
- [ ] Tested multiple concurrent orders
- [ ] Tested edge cases

---

## 📝 Bug Reporting Template

If you find issues, report them with this format:

```
**Bug Title:** [Brief description]

**Steps to Reproduce:**
1. Step one
2. Step two
3. Step three

**Expected Result:**
What should happen

**Actual Result:**
What actually happened

**Logs:**
[Paste relevant console logs]

**Device Info:**
- Device: [e.g., Pixel 6]
- OS: [e.g., Android 13]
- App Version: [Check app.json]

**Screenshots/Videos:**
[Attach if applicable]
```

---

## 🎉 Success!

If all tests pass, you have a fully functional smart order notification system that:
- ✅ Only notifies drivers when near restaurants
- ✅ Saves distant orders for later
- ✅ Automatically triggers notifications when approaching
- ✅ Works in background (screen off, other apps)
- ✅ Persists data across app restarts
- ✅ Handles edge cases gracefully

**Happy Testing! 🚀**












