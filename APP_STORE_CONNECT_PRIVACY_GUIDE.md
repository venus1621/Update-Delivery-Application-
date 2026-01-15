# App Store Connect Privacy Configuration Guide

**App:** Bahiran Delivery Driver  
**Version:** 1.0  
**Date:** January 2026

---

## ⚠️ CRITICAL: How to Fix Privacy Labels

Apple rejected your app because the privacy labels in App Store Connect incorrectly indicated "tracking" purposes. Follow these steps to fix it:

---

## 🔧 Step-by-Step Instructions

### 1. Log into App Store Connect

1. Go to https://appstoreconnect.apple.com
2. Navigate to: **My Apps** → **Bahiran Delivery Driver**
3. Click on the **App Privacy** section (left sidebar)

---

### 2. Configure Privacy Labels Correctly

Click **"Edit"** to update your privacy responses.

---

## 📍 LOCATION DATA Configuration

### Question: "Does your app collect Location data?"
**Answer:** ✅ **YES**

### Data Types Collected:
Select:
- ✅ **Precise Location**
- ✅ **Coarse Location**

### Usage Purposes - CRITICAL SECTION ⚠️

**SELECT THESE:**
- ✅ **App Functionality** (PRIMARY PURPOSE)
- ✅ **Product Personalization**
- ✅ **Customer Support**

**DO NOT SELECT:**
- ❌ **Third-Party Advertising** 
- ❌ **Developer's Advertising or Marketing**
- ❌ **Analytics** (unless you track aggregate metrics)
- ❌ **Other Purposes**

> **Why this matters:** Selecting "Third-Party Advertising" or certain analytics purposes triggers the App Tracking Transparency requirement. We don't do advertising tracking, so we should NOT select these.

### Is this data linked to the user?
**Answer:** ✅ **YES**

**Reason to select YES:**
- Location is associated with specific driver accounts
- Used to track driver's deliveries
- Linked to earnings and order history

### Do you use this data for tracking purposes?
**Answer:** ❌ **NO**

**CRITICAL:** This must be **NO** because:
- We do NOT use location data for cross-app/website tracking
- We do NOT share location with advertising networks
- We do NOT use location for targeted advertising
- We do NOT share with data brokers

**Definition of Tracking (per Apple):**
> "Tracking refers to linking data collected from your app with third-party data for advertising purposes, or sharing the collected data with data brokers."

We do NOT do this, so answer **NO**.

---

## 👤 CONTACT INFO Configuration

### Question: "Does your app collect Contact Info?"
**Answer:** ✅ **YES**

### Data Types:
- ✅ **Name**
- ✅ **Phone Number**
- ✅ **Email Address**

### Usage Purposes:
- ✅ **App Functionality** (PRIMARY)
- ✅ **Customer Support**
- ❌ **Third-Party Advertising** (DO NOT SELECT)

### Linked to User?
**Answer:** ✅ **YES**

### Used for Tracking?
**Answer:** ❌ **NO**

---

## 💳 FINANCIAL INFO Configuration

### Question: "Does your app collect Financial Info?"
**Answer:** ✅ **YES**

### Data Types:
- ✅ **Payment Info** (bank account for withdrawals)
- ✅ **Purchase History** (delivery earnings, transaction history)

### Usage Purposes:
- ✅ **App Functionality** (PRIMARY)
- ❌ **Third-Party Advertising** (DO NOT SELECT)

### Linked to User?
**Answer:** ✅ **YES**

### Used for Tracking?
**Answer:** ❌ **NO**

---

## 📊 USER CONTENT Configuration

### Question: "Does your app collect User Content?"
**Answer:** ✅ **YES** (only if you collect profile photos)

### Data Types:
- ✅ **Photos or Videos** (profile pictures)

### Usage Purposes:
- ✅ **App Functionality**
- ❌ **Third-Party Advertising** (DO NOT SELECT)

### Linked to User?
**Answer:** ✅ **YES**

### Used for Tracking?
**Answer:** ❌ **NO**

---

## 🔍 IDENTIFIERS Configuration

### Question: "Does your app collect Identifiers?"
**Answer:** ✅ **YES**

### Data Types:
- ✅ **User ID** (account ID)
- ✅ **Device ID** (for push notifications)

### Usage Purposes:
- ✅ **App Functionality**
- ✅ **Product Personalization**
- ❌ **Third-Party Advertising** (DO NOT SELECT)
- ❌ **Developer's Advertising or Marketing** (DO NOT SELECT)

### Linked to User?
**Answer:** ✅ **YES**

### Used for Tracking?
**Answer:** ❌ **NO**

---

## 📈 USAGE DATA Configuration

### Question: "Does your app collect Usage Data?"
**Answer:** ✅ **YES** (if you track order history, app usage)

### Data Types:
- ✅ **Product Interaction** (orders accepted, completed)
- ✅ **Other Usage Data** (app sessions, feature usage)

### Usage Purposes:
- ✅ **App Functionality**
- ✅ **Product Personalization**
- ✅ **Analytics** (ONLY if you use it for improving the app, NOT advertising)
- ❌ **Third-Party Advertising** (DO NOT SELECT)

### Linked to User?
**Answer:** ✅ **YES**

### Used for Tracking?
**Answer:** ❌ **NO**

---

## ✅ DATA NOT COLLECTED

### You should answer **NO** to these categories:

- ❌ **Health & Fitness** - Not collected
- ❌ **Sensitive Info** - Not collected
- ❌ **Browsing History** - Not collected
- ❌ **Search History** - Not collected
- ❌ **Purchases** (outside of your app's delivery earnings)
- ❌ **Diagnostics** - Unless you use crash reporting

---

## 🎯 Summary: The Key Rule

### For EVERY data type, when asked:
**"Do you use this data for tracking purposes?"**

### Answer: ❌ **NO**

**Because:**
1. We don't link data with third-party advertising networks
2. We don't share data with data brokers
3. We don't track users across other apps/websites
4. Location is for delivery functionality, NOT advertising

---

## 🚨 Common Mistakes to AVOID

### ❌ MISTAKE 1: Selecting "Third-Party Advertising"
**Problem:** Triggers ATT requirement  
**Solution:** Only select "App Functionality" and "Customer Support"

### ❌ MISTAKE 2: Saying location is used for "tracking"
**Problem:** Confused "location tracking for deliveries" with "tracking for advertising"  
**Solution:** Answer NO to tracking. It means advertising tracking, not GPS tracking.

### ❌ MISTAKE 3: Including "Analytics" without clarification
**Problem:** Some analytics purposes trigger ATT  
**Solution:** Only use "Analytics" if it's purely for improving app features (not advertising attribution)

---

## 📋 Privacy Policy URL

Make sure this is set in App Store Connect:

**Privacy Policy URL:** `https://bahirandelivery.com/privacy`

(Or upload your privacy-policy.html file to your website and link it)

---

## 🔄 After Making Changes

1. Click **"Save"** in App Store Connect
2. Submit a new version or resubmit current version
3. In **App Review Information** → **Notes**, paste the contents of `APP_REVIEW_NOTES.md`
4. Resubmit for review

---

## 📞 If You Need Help

If you have the Account Holder or Admin role:
- You can edit privacy labels directly
- Changes take effect immediately

If you DON'T have the role:
- Reply to Apple's rejection message in App Store Connect
- Say: "We do not have permission to edit privacy labels. Our app does not track users for advertising purposes. Location data is used only for delivery app functionality (navigation, order management). We do not share data with advertising networks or data brokers. Please update the privacy labels to reflect this, or grant us permission to edit them."

---

## ✅ Checklist Before Resubmission

- [ ] Privacy labels updated in App Store Connect
- [ ] "Tracking purposes" set to **NO** for all data types
- [ ] "Third-Party Advertising" deselected everywhere
- [ ] "App Functionality" selected as primary purpose
- [ ] Privacy Policy URL set correctly
- [ ] `APP_REVIEW_NOTES.md` pasted into Review Notes section
- [ ] New build uploaded with `audio` removed from UIBackgroundModes
- [ ] Test account credentials provided in Review Notes

---

**Remember:** The word "tracking" in Apple's context means advertising tracking, NOT GPS location tracking for deliveries!

---

*Last updated: January 2026*  
*Bahiran Delivery*

