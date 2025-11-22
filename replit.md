# Delivery Driver App - Production Ready

## Project Overview
This is a React Native Expo application for delivery personnel. The app provides real-time delivery tracking, order management, earnings tracking, and communication features.

## Recent Changes (November 22, 2025)
- ✅ Created complete project configuration (package.json, app.json, babel.config.js, metro.config.js)
- ✅ Set up Expo development environment for web deployment
- ✅ Implemented production-ready caching system with AsyncStorage
- ✅ Optimized React Query configuration for minimal API calls (30-minute stale time, 24-hour cache)
- ✅ Created API service with intelligent caching and request deduplication
- ✅ Added utility modules (logger, location-utils, cache-storage, api-service)
- ✅ Configured Expo Dev Server workflow on port 5000
- ✅ Installed all required dependencies including web support

## Project Architecture

### Tech Stack
- **Framework**: React Native with Expo (Web support enabled)
- **Navigation**: Expo Router (file-based routing)
- **State Management**: React Context API with @tanstack/react-query
- **Real-time**: Socket.IO client for live updates
- **Backend Integration**: Firebase Realtime Database
- **Location Services**: expo-location with background tracking
- **Maps**: react-native-maps
- **Storage**: AsyncStorage for persistence
- **UI**: Lucide React Native icons, Expo Linear Gradient

### Key Features
1. **Authentication**: Phone-based login with password reset flow
2. **Order Management**: Accept, track, and complete deliveries
3. **Real-time Tracking**: Live location updates sent to Firebase
4. **Navigation**: Integrated maps with route guidance
5. **Earnings**: Track delivery earnings and transaction history
6. **QR Scanning**: Verify deliveries with QR code scanning
7. **Offline Support**: Cached data for offline functionality

## Production Optimizations

### API Call Minimization
- **React Query Cache**: 30-minute stale time, 24-hour garbage collection
- **Persistent Cache**: AsyncStorage-based caching with expiry
- **Request Deduplication**: Prevents duplicate simultaneous requests
- **No Auto-refetch**: Disabled refetch on focus, mount, and reconnect
- **Manual Refresh**: Data only updates when user explicitly refreshes

### Bundle Size Optimization
- **Tree Shaking**: Enabled in Metro bundler
- **Lazy Loading**: Routes loaded on demand via Expo Router
- **Optimized Dependencies**: Using latest stable versions
- **Asset Optimization**: Placeholder assets for reduced initial size

### Performance Features
- **Memoization**: Extensive use of useMemo and useCallback
- **Debouncing**: Route recalculation debounced to 5 seconds
- **Location Batching**: Updates sent every 3-5 seconds (configurable)
- **Query Batching**: Multiple queries batched automatically

## File Structure
```
/
├── app/                    # Expo Router screens
│   ├── tabs/              # Bottom tab navigation
│   │   ├── dashboard.js   # Main delivery dashboard
│   │   ├── orders.js      # Available orders
│   │   ├── history.js     # Delivery history
│   │   └── profile.js     # User profile
│   ├── order/[orderId].js # Order details screen
│   ├── login.js           # Authentication
│   ├── map.js             # Navigation & tracking
│   └── _layout.js         # Root layout with providers
├── components/            # Reusable components
├── providers/             # Context providers
│   ├── auth-provider.js   # Authentication state
│   └── delivery-provider.js # Delivery management
├── services/              # Business logic
│   ├── api-service.js     # Cached API requests
│   ├── location-service.js # Location tracking
│   └── balance-service.js # Earnings calculations
├── utils/                 # Utility functions
│   ├── cache-storage.js   # Persistent caching
│   ├── location-utils.js  # Location transformations
│   └── logger.js          # Development logging
└── firebase.js            # Firebase initialization
```

## Development Setup

### Prerequisites
- Node.js 20+ installed (handled by Replit)
- Expo CLI (installed via npx)

### Running the App
The app runs automatically on port 5000 via the "Expo Dev Server" workflow.

**Development Commands**:
- `npm start` - Start Expo dev server
- `npm run web` - Run web version
- `npm run android` - Run on Android emulator
- `npm run ios` - Run on iOS simulator

### Environment Variables Required
- None for local development
- Firebase config fetched from backend API at runtime
- Backend API: `https://gebeta-delivery1.onrender.com/api/v1`

## Caching Strategy

### Data That's Cached
1. User profile and authentication state
2. Available orders list
3. Delivery history
4. Earnings data
5. Firebase configuration
6. API responses with configurable expiry

### Cache Invalidation
- **Manual**: User can pull-to-refresh on any screen
- **Automatic**: Cache expires after 30 minutes (configurable)
- **Clear All**: Available in profile settings
- **Logout**: Clears all cache and authentication data

### Cache Configuration
```javascript
// React Query (app/_layout.js)
staleTime: 30 minutes
gcTime: 24 hours
refetch: Manual only

// AsyncStorage Cache (utils/cache-storage.js)
Default expiry: 60 minutes (configurable per request)
Storage key prefix: '@delivery_cache_'
```

## API Service Usage

### Example: Cached GET Request
```javascript
import apiService from '../services/api-service';

// Fetch with 30-minute cache
const data = await apiService.get('/orders', {
  useCache: true,
  cacheExpiry: 30,
  forceRefresh: false
});

// Force refresh (bypass cache)
const freshData = await apiService.get('/orders', {
  useCache: true,
  forceRefresh: true
});
```

### Example: Clear All Cache
```javascript
import { cacheStorage } from '../utils/cache-storage';
await cacheStorage.clearAll();
```

## Known Limitations
- Web version requires desktop Chrome/Firefox/Safari
- Background location tracking requires native app
- QR scanning only works in native environments
- Push notifications not configured

## Future Enhancements
- [ ] Add service worker for offline web support
- [ ] Implement push notifications
- [ ] Add analytics and crash reporting
- [ ] Optimize images and assets
- [ ] Add E2E testing
- [ ] Implement code splitting for larger screens

## User Preferences
- Production-ready configuration with minimal API calls
- Aggressive caching for reduced data usage
- Small bundle size for faster load times
- Manual refresh controls for data updates

## Deployment
Ready for deployment via Expo Application Services (EAS) or web hosting for the web version.
