const { createServer } = require('https');
const { createServer: createHttpServer } = require('http');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');
const os = require('os');
const selfsigned = require('selfsigned');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = 3000;

// In development, disable SSL certificate validation for self-signed certificates
// This allows the server to make HTTPS requests to Supabase and other services
// when using self-signed certificates locally
if (dev) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.log('⚠️  SSL certificate validation disabled for development');
  console.log('   This allows self-signed certificates to be accepted');
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Self-signed certificate paths
const certPath = path.join(__dirname, 'cert.pem');
const keyPath = path.join(__dirname, 'key.pem');

// Check if certificates exist, if not, generate them
// Also regenerate if FORCE_REGENERATE_CERTS env var is set
function ensureCertificates() {
  const localIP = getLocalIP();
  const forceRegenerate = process.env.FORCE_REGENERATE_CERTS === 'true';
  const shouldRegenerate = forceRegenerate || !fs.existsSync(certPath) || !fs.existsSync(keyPath);
  
  if (shouldRegenerate) {
    // Delete existing certificates if forcing regeneration
    if (forceRegenerate) {
      if (fs.existsSync(certPath)) {
        fs.unlinkSync(certPath);
        console.log('🗑️  Deleted existing certificate');
      }
      if (fs.existsSync(keyPath)) {
        fs.unlinkSync(keyPath);
        console.log('🗑️  Deleted existing private key');
      }
    }
    console.log('⚠️  Generating self-signed certificates for HTTPS...');
    console.log('   (This is normal for local development)');
    
    try {
      // Generate self-signed certificate with IP address in SAN
      // selfsigned.generate is synchronous, not async
      const attrs = [{ name: 'commonName', value: 'localhost' }];
      const pems = selfsigned.generate(attrs, {
        keySize: 2048,
        days: 365,
        algorithm: 'sha256',
        ip: [localIP, '127.0.0.1', '0.0.0.0'],
        altNames: [
          'localhost',
          localIP,
          '127.0.0.1',
        ],
      });

      // The selfsigned package returns an object with 'cert' and 'private' properties
      // Write certificate and key to files
      if (!pems || !pems.cert || !pems.private) {
        throw new Error('Invalid certificate structure returned from selfsigned');
      }

      fs.writeFileSync(certPath, pems.cert);
      fs.writeFileSync(keyPath, pems.private);
      
      console.log('✅ Certificates generated successfully');
      console.log('   Certificate: cert.pem');
      console.log('   Private Key: key.pem');
      console.log(`   Includes IP: ${localIP}`);
    } catch (error) {
      console.error('❌ Failed to generate certificates:', error.message);
      console.error('   Error details:', error);
      process.exit(1);
    }
  } else {
    console.log('✅ Using existing certificates');
    console.log(`   Note: If connection fails, delete cert.pem and key.pem to regenerate with IP ${localIP}`);
  }
}

app.prepare().then(() => {
  ensureCertificates();

  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  const server = createServer(httpsOptions, async (req, res) => {
    const clientIP = req.socket.remoteAddress;
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} from ${clientIP}`);
    
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Add error handlers
  server.on('error', (err) => {
    console.error('Server error:', err);
  });

  server.on('clientError', (err, socket) => {
    // Check if this is an HTTP request on HTTPS port
    if (err.message && err.message.includes('http request')) {
      const localIP = getLocalIP();
      console.warn(`⚠️  HTTP request detected on HTTPS port. Use https://${localIP}:${port} instead of http://`);
      socket.write('HTTP/1.1 400 Bad Request\r\n');
      socket.write('Content-Type: text/plain\r\n\r\n');
      socket.write(`This server only accepts HTTPS connections.\n`);
      socket.write(`Please use: https://${localIP}:${port}\n`);
      socket.end();
    } else {
      console.error('Client error:', err.message);
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
  });

  // Create HTTP server on port 3001 to redirect to HTTPS
  const httpRedirectPort = 3001;
  const httpServer = createHttpServer((req, res) => {
    const localIP = getLocalIP();
    const host = req.headers.host?.replace(`:${httpRedirectPort}`, '') || localIP;
    const httpsUrl = `https://${host}:${port}${req.url}`;
    
    // Redirect HTTP to HTTPS
    res.writeHead(301, { 'Location': httpsUrl });
    res.end();
  });

  // Start HTTP redirect server
  httpServer.listen(httpRedirectPort, hostname, (err) => {
    if (err) {
      console.warn(`⚠️  Could not start HTTP redirect server on port ${httpRedirectPort}:`, err.message);
    } else {
      const localIP = getLocalIP();
      console.log(`> HTTP redirect server on http://localhost:${httpRedirectPort} -> https://localhost:${port}`);
      console.log(`> HTTP redirect server on http://${localIP}:${httpRedirectPort} -> https://${localIP}:${port}`);
    }
  });

  // Start HTTPS server
  server.listen(port, hostname, (err) => {
    if (err) throw err;
    const localIP = getLocalIP();
    console.log(`> Ready on https://localhost:${port}`);
    console.log(`> Network access: https://${localIP}:${port}`);
    console.log(`> ⚠️  You may see a security warning - this is normal for self-signed certificates`);
    console.log(`>    Click "Advanced" and "Proceed to ${localIP}" to continue`);
    console.log(`>`);
    console.log(`> 🔥 If you can't connect from mobile device:`);
    console.log(`>    1. Make sure you use HTTPS (https://${localIP}:${port}) not HTTP`);
    console.log(`>    2. Check Windows Firewall - allow port ${port}`);
    console.log(`>    3. Run: netsh advfirewall firewall add rule name="Next.js HTTPS" dir=in action=allow protocol=TCP localport=${port}`);
  });

  // Start HTTP redirect server on port 3001 (or handle HTTP on same port)
  // Actually, let's handle HTTP requests on the HTTPS server by detecting them
  // But we can't easily do that, so let's just improve error handling
});

