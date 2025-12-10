# Security Audit Report
**Date:** December 10, 2025
**Repository:** FloodWatch LK
**Auditor:** Automated Security Scan
**Status:** ✅ All Issues Resolved (December 10, 2025)

---

## ✅ RESOLUTION SUMMARY

All security issues identified in this audit have been successfully resolved:
- **Critical Issue Fixed:** Exposed Google Maps API key revoked and replaced
- **Code Updated:** Hardcoded API key removed from layout.tsx
- **Deployment Verified:** New secure key deployed to production
- **Repository Status:** Safe to make public

---

## 🔴 CRITICAL ISSUES

### 1. Hardcoded Google Maps API Key
**File:** `frontend/src/app/layout.tsx:23`
**Issue:** Google Maps API key is hardcoded as a fallback value
**Code:**
```typescript
const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyAUQv4YkDz2D0IgQqi6Ncocjm5sxFMp8zM';
```

**Risk:**
- API key is publicly visible in GitHub repository
- Can be abused by malicious actors
- May incur unexpected API charges
- Violates Google Maps Platform Terms of Service

**Recommendation:**
1. **IMMEDIATE:** Revoke this API key in Google Cloud Console
2. Create a new restricted API key with HTTP referrer restrictions
3. Remove the hardcoded fallback and require environment variable
4. Add the domain restrictions: `weather.hackandbuild.dev/*` and `*.vercel.app/*`

**Fix:**
```typescript
const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!mapsApiKey) {
  console.error('Google Maps API key not configured');
}
```

---

## 🟡 MEDIUM ISSUES

### 2. Placeholder URLs in SECURITY.md
**File:** `SECURITY.md:217`
**Issue:** GitHub issues URL contains placeholder text
**Code:**
```markdown
- Use GitHub issues: https://github.com/[your-org]/floodwatch-lk/issues
```

**Recommendation:**
Update to actual repository URL:
```markdown
- Use GitHub issues: https://github.com/thaaaru/floodwatch-lk/issues
```

### 3. Local .env Files Contain Real API Keys
**Files:**
- `backend/.env` (WEATHERAPI_KEY, TOMTOM_API_KEY)
- `frontend/.env.local` (VERCEL_OIDC_TOKEN)

**Status:** ✅ **SAFE** - These files are in `.gitignore` and NOT committed to repository

**Verification:**
```bash
$ git ls-files | grep "\.env"
(no output - files are not tracked)
```

**Recommendation:**
- Keep these files in `.gitignore` (already done ✅)
- Rotate the VERCEL_OIDC_TOKEN if repository was ever public
- Document in README that API keys are required

---

## 🟢 LOW PRIORITY / INFORMATIONAL

### 4. Default Database Credentials in config.py
**File:** `backend/app/config.py:9`
**Code:**
```python
database_url: str = "postgresql://user:password@localhost:5432/floodwatch"
```

**Status:** ✅ **SAFE** - This is a placeholder default, overridden by environment variable

**Note:** This is standard practice for Pydantic BaseSettings. The actual credentials come from `.env` file (which is not committed).

### 5. TODO Comments in Code
**Files:**
- `frontend/src/lib/wind/providers/era5Provider.ts` - TODO: Implement actual CDS API calls
- `frontend/src/lib/wind/providers/iconProvider.ts` - TODO: Implement actual GRIB2 fetching

**Status:** Normal - These are development notes, not security issues

---

## ✅ SECURITY BEST PRACTICES VERIFIED

1. **Environment Files Protected:**
   - `.gitignore` properly configured for `.env`, `.env.local`, `.env.production`
   - No `.env` files found in git history
   - `.env.example` files provided as templates

2. **No Hardcoded Secrets in Backend:**
   - All API keys loaded from environment variables
   - No database credentials hardcoded
   - No Twilio tokens in code

3. **No Certificate/Key Files:**
   - No `.pem`, `.key`, `.crt`, or `id_rsa` files found
   - No SSH keys in repository

4. **Proper Dependency Management:**
   - `node_modules/` and `venv/` excluded from git
   - Dependencies managed through `package.json` and `requirements.txt`

---

## 📋 ACTION ITEMS

### ✅ Completed (December 10, 2025)

- [x] **CRITICAL:** Revoked the exposed Google Maps API key `AIzaSyAUQv4YkDz2D0IgQqi6Ncocjm5sxFMp8zM`
- [x] Created a new Google Maps API key with domain restrictions
- [x] Removed hardcoded API key fallback from `layout.tsx`
- [x] Updated SECURITY.md GitHub URL placeholder
- [x] Added new API key to Vercel (all environments)
- [x] Deployed and verified on production

### Before Next Release

- [ ] Add API key documentation to README
- [ ] Create `.env.example` with all required variables
- [ ] Add security scanning to CI/CD pipeline (e.g., `trufflehog`, `gitleaks`)
- [ ] Consider adding GitHub secret scanning

### Recommended Security Tools

```bash
# Install gitleaks for secret scanning
brew install gitleaks

# Scan repository for secrets
gitleaks detect --source . --verbose

# Scan git history
gitleaks detect --source . --log-opts="--all"
```

---

## 🔐 SECURITY CHECKLIST FOR DEPLOYMENT

- [ ] All API keys configured via environment variables
- [ ] Database credentials are strong (20+ characters)
- [ ] HTTPS/TLS enabled for production
- [ ] CORS configured for specific domains
- [ ] Rate limiting enabled on API endpoints
- [ ] Security headers configured (CSP, HSTS, X-Frame-Options)
- [ ] Logging and monitoring enabled
- [ ] Backup and disaster recovery procedures in place

---

## 📊 SUMMARY

**Total Issues Found:** 3 (All Resolved ✅)
- 🔴 Critical: 1 (Hardcoded Google Maps API key) - **FIXED**
- 🟡 Medium: 1 (Placeholder URL) - **FIXED**
- 🟢 Low: 1 (Informational)

**Overall Security Posture:** ✅ **SECURE**

All critical and medium security issues have been resolved. The repository follows security best practices with proper .gitignore configuration, no committed secrets, and all API keys managed through environment variables. The exposed Google Maps API key has been revoked and replaced with a new restricted key.

---

**Next Steps:**
1. Fix the Google Maps API key issue immediately
2. Update placeholder URLs
3. Review this report with the team
4. Implement recommended security scanning tools

---

*This audit was performed on December 10, 2025. Security is an ongoing process - perform regular audits and keep dependencies updated.*
