# Privacy Policy & SEO Files Documentation

This document explains the privacy policy and SEO files created for the Bahiran Delivery Driver App.

## 📄 Files Created

### 1. **PRIVACY_POLICY.md**
- **Location:** Root directory
- **Format:** Markdown
- **Purpose:** Comprehensive privacy policy document for legal compliance
- **Usage:** Reference document, can be converted to PDF for app stores

### 2. **privacy-policy.html**
- **Location:** Root directory
- **Format:** HTML with responsive design
- **Purpose:** Web-hosted version of privacy policy
- **Features:**
  - Beautiful gradient design matching app branding
  - Fully responsive (mobile & desktop)
  - Professional styling with color-coded sections
  - Easy to read and navigate
  - Ready to host on your website

### 3. **sitemap.xml**
- **Location:** `public/sitemap.xml`
- **Purpose:** Help search engines discover and index your website pages
- **Includes:**
  - Home page
  - Privacy policy
  - Terms of service
  - Driver app download page
  - Customer app download page
  - Support & FAQ pages
  - Partner/restaurant signup pages

### 4. **robots.txt**
- **Location:** `public/robots.txt`
- **Purpose:** Control how search engines crawl your website
- **Configuration:**
  - Allows all major search engines
  - Points to sitemap.xml
  - Blocks admin/API routes from indexing

## 🔐 Privacy Policy Coverage

The privacy policy covers:

### Data Collection
- ✅ Personal information (name, phone, email)
- ✅ Financial data (earnings, withdrawals, bank accounts)
- ✅ Location data (foreground & background)
- ✅ Camera usage (QR code scanning)
- ✅ Device information
- ✅ Usage analytics

### Data Usage
- ✅ Service delivery & navigation
- ✅ Payment processing
- ✅ Communication & notifications
- ✅ Safety & security
- ✅ App improvement

### User Rights
- ✅ Access, update, delete data
- ✅ Location settings control
- ✅ Notification preferences
- ✅ Account management

### Legal Compliance
- ✅ GDPR considerations (EU users)
- ✅ Ethiopian data protection compliance
- ✅ Children's privacy (under 18)
- ✅ Third-party service disclosures

### Permissions Explained
- ✅ Android permissions list with explanations
- ✅ iOS permissions requirements
- ✅ Why each permission is needed

## 🚀 How to Use These Files

### For the Mobile App

1. **In-App Privacy Policy**
   ```javascript
   // Add to your app (e.g., in login.js or profile.js)
   import { Linking } from 'react-native';
   
   const openPrivacyPolicy = () => {
     Linking.openURL('https://bahirandelivery.com/privacy');
   };
   ```

2. **App Store Submissions**
   - Upload `PRIVACY_POLICY.md` when submitting to Google Play
   - Provide privacy policy URL: `https://bahirandelivery.com/privacy`
   - Required for both Google Play and Apple App Store

### For Your Website

1. **Deploy Privacy Policy**
   ```bash
   # Upload privacy-policy.html to your web server
   # Make it accessible at: https://bahirandelivery.com/privacy
   ```

2. **Deploy Sitemap**
   ```bash
   # Upload to: https://bahirandelivery.com/sitemap.xml
   # Submit to Google Search Console
   # Submit to Bing Webmaster Tools
   ```

3. **Deploy Robots.txt**
   ```bash
   # Upload to: https://bahirandelivery.com/robots.txt
   # Must be at root domain level
   ```

### For SEO

1. **Submit to Google Search Console**
   - Go to https://search.google.com/search-console
   - Add your website
   - Submit sitemap: `https://bahirandelivery.com/sitemap.xml`

2. **Submit to Bing Webmaster Tools**
   - Go to https://www.bing.com/webmasters
   - Add your website
   - Submit sitemap

3. **Update app.json**
   - Already updated with privacy policy URL
   - Includes app description for SEO

## 📱 App Store Requirements

### Google Play Store
- ✅ Privacy policy URL in app listing
- ✅ Data safety section completed
- ✅ Permissions clearly explained
- ✅ Data collection disclosed

### Apple App Store
- ✅ Privacy policy URL required
- ✅ Privacy nutrition labels
- ✅ Permission usage descriptions (already in app.json)
- ✅ Data collection practices disclosed

## 🔗 Important URLs

Update these URLs in your actual deployment:

- Privacy Policy: `https://bahirandelivery.com/privacy`
- Terms of Service: `https://bahirandelivery.com/terms`
- Support Email: `support@bahirandelivery.com`
- Privacy Email: `privacy@bahirandelivery.com`
- DPO Email: `dpo@bahirandelivery.com`

## 📊 Data Processing Summary

| Data Type | Retention | Sharing |
|-----------|-----------|---------|
| Account Info | Account lifetime + 30 days | Customers, restaurants |
| Location Data | 90 days | Customers (active orders) |
| Financial Data | 7 years | Payment processors |
| Order History | 2 years | Not shared |
| Device Info | Account lifetime | Analytics services |
| Camera Data | Not stored | Not shared |

## 🛡️ Security Measures

The privacy policy discloses:
- Encryption (HTTPS/TLS in transit, at rest)
- Secure authentication (password hashing, tokens)
- Access controls
- Regular security audits

## ⚖️ Legal Considerations

### Compliance
- Ethiopian data protection laws
- GDPR (for EU users)
- Industry-standard data retention
- User consent mechanisms

### User Rights
- Right to access data
- Right to update/correct data
- Right to delete account
- Right to data portability
- Right to opt-out

## 📞 Contact Information

For privacy-related inquiries:
- **Privacy Email:** privacy@bahirandelivery.com
- **Data Protection Officer:** dpo@bahirandelivery.com
- **Support:** support@bahirandelivery.com
- **Phone:** +251 (0) 931 386 887

## 📝 Updating the Privacy Policy

When you update the privacy policy:

1. **Update all versions:**
   - PRIVACY_POLICY.md
   - privacy-policy.html
   - Website version

2. **Change dates:**
   - Update "Last Updated" date
   - Keep "Effective Date" for original version

3. **Notify users:**
   - In-app notification for material changes
   - Email notification to all drivers
   - Update version number

4. **Document changes:**
   - Keep changelog of what changed
   - Note reason for update

## 🌐 Multi-Language Support

The privacy policy is currently in English. Consider translating to:
- **Amharic** (አማርኛ) - Primary language in Ethiopia
- **Oromo** (Afaan Oromoo)
- **Tigrinya** (ትግርኛ)

## ✅ Checklist Before Launch

- [ ] Privacy policy uploaded to website
- [ ] Privacy URL added to app.json (✅ Done)
- [ ] Privacy policy link in app footer/profile
- [ ] Sitemap.xml deployed
- [ ] Robots.txt deployed
- [ ] Sitemap submitted to Google Search Console
- [ ] Sitemap submitted to Bing Webmaster Tools
- [ ] Google Play Store privacy section completed
- [ ] Apple App Store privacy labels completed
- [ ] User consent flow implemented in app
- [ ] Privacy policy reviewed by legal counsel (recommended)

## 📄 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Dec 3, 2025 | Initial privacy policy created |

## 📚 Additional Resources

- [Google Play Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Apple Privacy Requirements](https://developer.apple.com/app-store/app-privacy-details/)
- [GDPR Compliance Guide](https://gdpr.eu/)
- [Ethiopian Data Protection](https://www.ethiopia.gov.et/)

---

**Document Created:** December 3, 2025  
**Created For:** Bahiran Delivery Driver App  
**Package:** com.bahiran.deliverydriver.app  
**Version:** 1.0.0

---

© 2025 Bahiran Delivery. All rights reserved.





