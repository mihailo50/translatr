This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

The server will automatically try to use HTTPS with self-signed certificates. If certificate generation fails, it will automatically fall back to HTTP mode.

### Development Server Options

- **`npm run dev`** - Starts the server with HTTPS (auto-generates certificates if needed)
- **`npm run dev:http`** - Forces HTTP mode (bypasses HTTPS entirely)
- **`npm run dev:regenerate-certs`** - Forces regeneration of SSL certificates

### Troubleshooting Certificate Issues

If you encounter certificate generation errors:

1. **Use HTTP mode** (easiest solution):

   ```bash
   npm run dev:http
   ```

   Or set the environment variable:

   ```bash
   USE_HTTP=true npm run dev
   ```

2. **Regenerate certificates**:

   ```bash
   npm run dev:regenerate-certs
   ```

3. **Delete existing certificates and retry**:

   ```bash
   # Delete cert files
   rm cert.pem key.pem  # Linux/Mac
   del cert.pem key.pem  # Windows

   # Then run normally
   npm run dev
   ```

4. **Reinstall dependencies**:
   ```bash
   npm install
   ```

The server will automatically fall back to HTTP if HTTPS certificate generation fails, so the project should start without errors in most cases.

Open [http://localhost:3000](http://localhost:3000) or [https://localhost:3000](https://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
