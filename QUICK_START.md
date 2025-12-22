# 🚀 Quick Start Guide - Smart Order System

## ⚡ Get Testing in 5 Minutes!

### Step 1: Install Dependencies
```bash
npm install
# or
yarn install
```

### Step 2: Start the App
```bash
npx expo start --clear
```

### Step 3: Build & Install on Device
```bash
# For Android
eas build --profile preview --platform android

# Or use Expo Go (faster for testing)
npx expo start
# Then scan QR code with Expo Go app
```

### Step 4: Login & Grant Permissions
1. Open the app
2. Log in with your delivery credentials
3. Allow **Location** (Always) ✅
4. Allow **Notifications** ✅

### Step 5: Test Basic Flow

#### 🟢 Go Online
1. Toggle the online switch
2. You should see in logs:
   ```
   🟢 Going online - starting smart order monitoring
   📥 Synced X orders from database
   ```

#### 📦 Test Near Order (< 5km)
1. Position yourself near a restaurant (< 5km)
2. Have an order sent to your account
3. **Expected:** Instant notification + sound + vibration + modal

#### 📦 Test Far Order (> 5km)
1. Position yourself far from restaurant (> 5km)
2. Have an order sent to your account
3. **Expected:** No notification (saved to database)

#### 🚶 Test Movement
1. While far from restaurant, start moving towards it
2. When you get within 5km, notification should appear automatically
3. **Expected:** Notification triggers when approaching

#### ✅ Accept Order
1. Tap **Accept** on the modal
2. **Expected:** Order added to active orders, removed from pending

#### ❌ Decline Order
1. Tap **Decline** on the modal
2. **Expected:** Modal closes, order removed from pending

---

## 🔍 Quick Debug Commands

### Check Console for These Key Logs:

#### On New Order:
```
📦 New delivery order received: ORD-XXX
📍 New order ORD-XXX: Distance to restaurant = XXXXm
```

#### If Near (< 5km):
```
✅ Driver is near restaurant (XXXXm) - showing notification
```

#### If Far (> 5km):
```
💾 Driver is far from restaurant (XXXXm) - saving to database
```

#### When Moving Closer:
```
📍 Driver is now near restaurant for order ORD-XXX (XXXXm)!
```

---

## 🐛 Quick Troubleshooting

### Problem: No notifications at all
**Solution:**
- Check notification permissions
- Verify you're online (green toggle)
- Check logs for errors

### Problem: Getting notifications for far orders
**Solution:**
- Check proximity threshold (default 5000m)
- Verify restaurant location data
- Check distance calculation in logs

### Problem: Background not working
**Solution:**
- Allow "Always" location access
- Disable battery optimization for the app
- Check foreground service permissions

---

## 📂 Key Files to Know

### Services (Backend Logic):
- `services/smart-order-service.js` - Main proximity logic
- `services/database-service.js` - SQLite database
- `services/location-service.js` - GPS tracking
- `services/order-notification-service.js` - Notifications

### Providers (State Management):
- `providers/delivery-provider.js` - Main app state

### Documentation:
- `SMART_ORDER_SYSTEM_README.md` - Full system docs
- `TESTING_GUIDE.md` - Complete testing guide
- `QUICK_START.md` - This file!

---

## 🎯 Success Checklist

- [ ] App builds successfully
- [ ] Login works
- [ ] Location permission granted (Always)
- [ ] Notification permission granted
- [ ] Database initialized (check logs)
- [ ] Can toggle online/offline
- [ ] Near orders notify immediately
- [ ] Far orders save to database
- [ ] Moving closer triggers notification
- [ ] Accept/decline works
- [ ] Background operation works

---

## 📞 Need More Help?

- **Full Testing Guide:** See `TESTING_GUIDE.md`
- **System Architecture:** See `SMART_ORDER_SYSTEM_README.md`
- **Code Issues:** Check console logs and linter errors

---

## ⚙️ Configuration

### Change Proximity Threshold:
Edit `services/smart-order-service.js`:
```javascript
this.PROXIMITY_THRESHOLD = 5000; // meters (5km)
```

### Change Check Frequency:
```javascript
this.CHECK_FREQUENCY = 30000; // milliseconds (30s)
```

---

## 🎉 You're Ready!

The app is now set up with:
- ✅ Smart proximity-based notifications
- ✅ Background monitoring
- ✅ SQLite database persistence
- ✅ Comprehensive logging

**Happy Testing! 🚀**

*For detailed testing scenarios, see `TESTING_GUIDE.md`*




