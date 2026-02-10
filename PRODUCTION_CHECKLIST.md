# Production Deployment Checklist

## ✅ Completed Items

### Security
- [x] **CSP (Content Security Policy)** - Configured in `next.config.ts` with proper directives
- [x] **Security Headers** - HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- [x] **Error Boundaries** - `ErrorBoundary.tsx` component implemented
- [x] **Production-Safe Logging** - `utils/logger.ts` utility created
- [x] **Error Suppression** - `ErrorSuppressor.tsx` for third-party library errors
- [x] **HTTPS Configuration** - Self-signed certificates for development, ready for production certificates

### Build & Optimization
- [x] **Next.js Production Build** - `npm run build` configured
- [x] **Bundle Optimization** - Package imports optimized (lucide-react, LiveKit, Supabase)
- [x] **Image Optimization** - Remote patterns configured, AVIF/WebP formats enabled
- [x] **Compression** - Gzip/Brotli enabled
- [x] **ETags** - Enabled for better caching
- [x] **Electron Build** - Windows installer created successfully

### Code Quality
- [x] **TypeScript** - Type checking configured
- [x] **ESLint** - Linting configured
- [x] **Console Statements** - Most wrapped in development checks or logger utility
- [x] **Error Handling** - Comprehensive error handling throughout

### Infrastructure
- [x] **Health Check Endpoint** - `/api/health` for monitoring
- [x] **Download System** - API routes configured for desktop app downloads
- [x] **Supabase Integration** - Server/client utilities configured
- [x] **Environment Variables** - Proper fallbacks and error handling

## ⚠️ Items to Complete Before Production

### Environment Variables
Create a `.env.production` file with:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_production_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key

# Site URL
NEXT_PUBLIC_SITE_URL=https://your-production-domain.com

# LiveKit (if using)
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=your_livekit_url

# Downloads Bucket (optional, for Supabase Storage)
NEXT_PUBLIC_DOWNLOADS_BUCKET=downloads
```

### SSL/TLS Certificates
- [ ] Replace self-signed certificates with production certificates (Let's Encrypt, etc.)
- [ ] Update `server.js` to use production certificates
- [ ] Ensure HTTPS is properly configured

### Supabase Setup
- [ ] Verify all database tables are created (run `supabase_schema.sql`)
- [ ] Set up Row Level Security (RLS) policies
- [ ] Create storage buckets:
  - `avatars` (public, for user avatars)
  - `attachments` (public, for chat attachments)
  - `downloads` (public, for desktop app installers)
- [ ] Configure storage bucket policies
- [ ] Set up database backups

### Monitoring & Logging
- [ ] Set up error tracking (Sentry, LogRocket, etc.)
- [ ] Configure production logging service
- [ ] Set up uptime monitoring
- [ ] Configure alerting for critical errors

### Performance
- [ ] Run bundle analyzer: `npm run build:analyze`
- [ ] Optimize large dependencies if needed
- [ ] Set up CDN for static assets (if not using Vercel)
- [ ] Configure caching headers for static assets

### Testing
- [ ] Run full test suite (if tests exist)
- [ ] Test authentication flow
- [ ] Test file uploads (avatars, attachments)
- [ ] Test real-time features (chat, calls)
- [ ] Test download functionality
- [ ] Cross-browser testing
- [ ] Mobile responsiveness testing

### Documentation
- [ ] Update README.md with deployment instructions
- [ ] Document environment variables
- [ ] Document API endpoints
- [ ] Create deployment runbook

### Security Review
- [ ] Review all API routes for proper authentication
- [ ] Verify RLS policies are correctly configured
- [ ] Check for any hardcoded secrets
- [ ] Review CSP directives for any missing sources
- [ ] Test for XSS vulnerabilities
- [ ] Test for CSRF protection

### Deployment
- [ ] Choose hosting platform (Vercel, AWS, etc.)
- [ ] Configure production domain
- [ ] Set up CI/CD pipeline
- [ ] Configure environment variables in hosting platform
- [ ] Test deployment process
- [ ] Set up rollback procedure

### Post-Deployment
- [ ] Verify all features work in production
- [ ] Monitor error logs
- [ ] Check performance metrics
- [ ] Test user registration/login
- [ ] Verify email sending (if applicable)
- [ ] Test payment processing (if applicable)

## Notes

- The application uses Next.js 16 with Server Components and Server Actions
- Electron desktop app is configured and builds successfully
- All console statements are either wrapped in development checks or use the logger utility
- Error boundaries prevent crashes from propagating to users
- CSP is configured but may need adjustment based on third-party services used

## Quick Production Build Test

```bash
# Build for production
npm run build

# Test production build locally
npm run start

# Build Electron app
npm run dist -- --win
```

## Environment-Specific Notes

### Development
- Uses self-signed certificates for HTTPS
- More permissive CSP (allows HTTP/localhost)
- Console logging enabled
- Development error messages shown

### Production
- Requires valid SSL certificates
- Strict CSP (HTTPS only)
- Console logging disabled (errors still logged)
- User-friendly error messages
- Security headers enforced
