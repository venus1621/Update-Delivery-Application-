# 📋 Quick Resubmission Checklist

Use this checklist to ensure you complete all steps before resubmitting to Apple.

---

## ✅ Pre-Resubmission Checklist

### 1. Code Changes (Already Done ✅)
- [x] Removed "audio" from UIBackgroundModes in `app.json`
- [x] Privacy policy updated with anti-tracking clarifications

---

### 2. Build New Version (DO THIS NOW)
- [ ] Run: `eas build --platform ios --profile production`
- [ ] Wait for build to complete
- [ ] Download the IPA file
- [ ] Note the build number: ___________

---

### 3. App Store Connect - Privacy Labels (CRITICAL ⚠️)
Go to: **App Store Connect** → **Bahiran Delivery Driver** → **App Privacy** → **Edit**

#### For LOCATION DATA:
- [ ] Usage Purpose: ✅ **App Functionality** (NOT "Third-Party Advertising")
- [ ] Usage Purpose: ✅ **Product Personalization** (optional)
- [ ] Used for tracking? → ❌ **NO**
- [ ] Linked to user? → ✅ **YES**

#### For CONTACT INFO (Name, Phone, Email):
- [ ] Usage Purpose: ✅ **App Functionality**
- [ ] Used for tracking? → ❌ **NO**

#### For FINANCIAL INFO:
- [ ] Usage Purpose: ✅ **App Functionality**
- [ ] Used for tracking? → ❌ **NO**

#### For ALL OTHER DATA TYPES:
- [ ] When asked "Used for tracking purposes?" → Always ❌ **NO**
- [ ] Deselect "Third-Party Advertising" everywhere

**⚠️ This step is CRITICAL for fixing rejection #1**

---

### 4. Upload New Build
- [ ] Go to: **App Store Connect** → **Bahiran Delivery Driver** → **Version 1.0**
- [ ] Click **"+"** to add a build
- [ ] Select your new build
- [ ] Wait for processing (~10-30 minutes)
- [ ] Verify build shows as "Ready to Submit"

---

### 5. Add App Review Notes
- [ ] Go to: **Version 1.0** → **App Review Information** section
- [ ] Scroll to **"Notes"** field
- [ ] Open file: `APP_REVIEW_NOTES.md`
- [ ] Copy ENTIRE contents
- [ ] Paste into Notes field
- [ ] Save

---

### 6. Provide Test Account (Recommended)
- [ ] Create test account or use existing:
  - **Username:** `+251 ___ ___ ____`
  - **Password:** `________________`
- [ ] Add to **App Review Information** → **Sign-in required** section
- [ ] Test that login works before submitting

---

### 7. Reply to Rejection
- [ ] Go to: **App Store Connect** → **Resolution Center**
- [ ] Find rejection message
- [ ] Click **"Reply"**
- [ ] Copy the appropriate reply from `APPLE_REJECTION_FIX_SUMMARY.md` (Option A or B)
- [ ] Customize with your build number
- [ ] Send reply

---

### 8. Final Review
- [ ] Verify all privacy labels are correct
- [ ] Verify new build is selected
- [ ] Verify review notes are complete
- [ ] Verify test account credentials work
- [ ] Check that screenshots/description are still accurate

---

### 9. Submit for Review
- [ ] Click **"Submit for Review"**
- [ ] Answer any additional questions
- [ ] Confirm submission
- [ ] Note submission date/time: ___________

---

### 10. After Submission
- [ ] Monitor email for Apple's response
- [ ] Check App Store Connect daily
- [ ] Expected review time: 24-48 hours
- [ ] Be ready to respond quickly if Apple has questions

---

## 🚨 Common Mistakes to Avoid

- ❌ Don't skip updating privacy labels (most common mistake!)
- ❌ Don't select "Third-Party Advertising" anywhere
- ❌ Don't answer "YES" to "Used for tracking?"
- ❌ Don't forget to paste App Review Notes
- ❌ Don't submit old build (must be new build without "audio")
- ❌ Don't forget to reply to rejection message

---

## 📞 Quick Help

**If you can't edit privacy labels:**
- You need Account Holder or Admin role
- Ask your account holder to do it
- OR include in rejection reply that you need Apple to update them

**If you forgot your build number:**
- Check EAS dashboard: https://expo.dev/
- Or check in App Store Connect → Activity → iOS History

**If build is stuck in processing:**
- Wait 30-60 minutes
- Check for email from Apple about issues
- May need to rebuild if there are errors

---

## ✨ You're Ready to Resubmit When:

- ✅ All checklist items are complete
- ✅ New build uploaded and processed
- ✅ Privacy labels updated (tracking = NO)
- ✅ Review notes added
- ✅ Rejection reply sent
- ✅ Submit button clicked

---

**Expected Outcome:** Approval within 24-48 hours 🎉

**If rejected again:** Reply immediately with specific questions about what wasn't clear

---

Good luck! 🚀

