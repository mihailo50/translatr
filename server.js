const { createServer } = require("https");
const { createServer: createHttpServer } = require("http");
const { parse } = require("url");
const next = require("next");
const fs = require("fs");
const path = require("path");
const os = require("os");
const selfsigned = require("selfsigned");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = 3000;

// In development, disable SSL certificate validation for self-signed certificates
// This allows the server to make HTTPS requests to Supabase and other services
// when using self-signed certificates locally
if (dev) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  console.log("⚠️  SSL certificate validation disabled for development");
  console.log("   This allows self-signed certificates to be accepted");
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

// Self-signed certificate paths
const certPath = path.join(__dirname, "cert.pem");
const keyPath = path.join(__dirname, "key.pem");

// Allow bypassing HTTPS via environment variable
const useHTTPS = process.env.USE_HTTP !== "true";

// Validate IP address format
function isValidIP(ip) {
  if (!ip || ip === "localhost") return false;
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) return false;
  const parts = ip.split(".").map(Number);
  return parts.every((part) => part >= 0 && part <= 255);
}

// Check if certificates exist, if not, generate them
// Also regenerate if FORCE_REGENERATE_CERTS env var is set
// Returns true if certificates are available, false otherwise
function ensureCertificates() {
  if (!useHTTPS) {
    console.log("ℹ️  HTTPS disabled via USE_HTTP=true, using HTTP only");
    return false;
  }

  const localIP = getLocalIP();
  const forceRegenerate = process.env.FORCE_REGENERATE_CERTS === "true";
  const shouldRegenerate = forceRegenerate || !fs.existsSync(certPath) || !fs.existsSync(keyPath);

  if (shouldRegenerate) {
    // Delete existing certificates if forcing regeneration
    if (forceRegenerate) {
      if (fs.existsSync(certPath)) {
        fs.unlinkSync(certPath);
        console.log("🗑️  Deleted existing certificate");
      }
      if (fs.existsSync(keyPath)) {
        fs.unlinkSync(keyPath);
        console.log("🗑️  Deleted existing private key");
      }
    }
    console.log("⚠️  Generating self-signed certificates for HTTPS...");
    console.log("   (This is normal for local development)");

    try {
      // Validate and prepare IP addresses
      const ipAddresses = ["127.0.0.1", "0.0.0.0"];
      if (isValidIP(localIP)) {
        ipAddresses.push(localIP);
      }

      // Prepare alt names
      const altNames = ["localhost", "127.0.0.1"];
      if (isValidIP(localIP)) {
        altNames.push(localIP);
      }

      // Generate self-signed certificate with IP address in SAN
      // selfsigned.generate is synchronous, not async
      const attrs = [{ name: "commonName", value: "localhost" }];
      const options = {
        keySize: 2048,
        days: 365,
        algorithm: "sha256",
        ip: ipAddresses,
        altNames: altNames,
      };

      console.log(`   Generating certificate for IPs: ${ipAddresses.join(", ")}`);
      const pems = selfsigned.generate(attrs, options);

      // Validate the returned structure
      if (!pems) {
        throw new Error("selfsigned.generate() returned null or undefined");
      }

      if (typeof pems !== "object") {
        throw new Error(
          `selfsigned.generate() returned unexpected type: ${typeof pems}. Expected object.`
        );
      }

      // Check for both possible property names (some versions use 'private', others use 'key')
      const cert = pems.cert || pems.certificate;
      const privateKey = pems.private || pems.key;

      if (!cert || typeof cert !== "string") {
        throw new Error(
          `selfsigned.generate() returned invalid cert property. Got: ${typeof cert}. Available keys: ${Object.keys(pems).join(", ")}`
        );
      }

      if (!privateKey || typeof privateKey !== "string") {
        throw new Error(
          `selfsigned.generate() returned invalid private key property. Got: ${typeof privateKey}. Available keys: ${Object.keys(pems).join(", ")}`
        );
      }

      fs.writeFileSync(certPath, cert);
      fs.writeFileSync(keyPath, privateKey);

      console.log("✅ Certificates generated successfully");
      console.log("   Certificate: cert.pem");
      console.log("   Private Key: key.pem");
      if (isValidIP(localIP)) {
        console.log(`   Includes IP: ${localIP}`);
      }
      return true;
    } catch (error) {
      console.error("❌ Failed to generate certificates:", error.message);
      if (error.stack) {
        console.error("   Stack trace:", error.stack.split("\n").slice(0, 3).join("\n"));
      }
      console.error("\n   💡 Tip: You can bypass HTTPS by setting USE_HTTP=true");
      console.error("   Example: USE_HTTP=true npm run dev");
      console.error("\n   Troubleshooting steps:");
      console.error("   1. Try deleting any existing cert.pem and key.pem files");
      console.error("   2. Run: npm install selfsigned@latest");
      console.error("   3. Check Node.js version (should be >= 14)");
      console.error("   4. Use HTTP mode: USE_HTTP=true npm run dev");
      return false;
    }
  } else {
    // Verify existing certificates are valid
    try {
      const cert = fs.readFileSync(certPath, "utf8");
      const key = fs.readFileSync(keyPath, "utf8");
      if (!cert || !key || cert.length < 100 || key.length < 100) {
        throw new Error("Certificate files appear to be invalid");
      }
      console.log("✅ Using existing certificates");
      if (isValidIP(localIP)) {
        console.log(
          `   Note: If connection fails, delete cert.pem and key.pem to regenerate with IP ${localIP}`
        );
      }
      return true;
    } catch (error) {
      console.warn("⚠️  Existing certificates appear invalid, will regenerate...");
      if (fs.existsSync(certPath)) fs.unlinkSync(certPath);
      if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
      return ensureCertificates(); // Retry generation
    }
  }
}

app.prepare().then(() => {
  const certificatesAvailable = ensureCertificates();
  const localIP = getLocalIP();
  const useHTTPSMode = useHTTPS && certificatesAvailable;

  if (useHTTPSMode) {
    // HTTPS Mode
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
        console.error("Error occurred handling", req.url, err);
        res.statusCode = 500;
        res.end("internal server error");
      }
    });

    // Add error handlers
    server.on("error", (err) => {
      console.error("Server error:", err);
    });

    server.on("clientError", (err, socket) => {
      // Check if this is an HTTP request on HTTPS port
      if (err.message && err.message.includes("http request")) {
        console.warn(
          `⚠️  HTTP request detected on HTTPS port. Use https://${localIP}:${port} instead of http://`
        );
        socket.write("HTTP/1.1 400 Bad Request\r\n");
        socket.write("Content-Type: text/plain\r\n\r\n");
        socket.write(`This server only accepts HTTPS connections.\n`);
        socket.write(`Please use: https://${localIP}:${port}\n`);
        socket.end();
      } else {
        console.error("Client error:", err.message);
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      }
    });

    // Create HTTP server on port 3001 to redirect to HTTPS
    const httpRedirectPort = 3001;
    const httpServer = createHttpServer((req, res) => {
      const host = req.headers.host?.replace(`:${httpRedirectPort}`, "") || localIP;
      const httpsUrl = `https://${host}:${port}${req.url}`;

      // Redirect HTTP to HTTPS
      res.writeHead(301, { Location: httpsUrl });
      res.end();
    });

    // Start HTTP redirect server
    httpServer.listen(httpRedirectPort, hostname, (err) => {
      if (err) {
        console.warn(
          `⚠️  Could not start HTTP redirect server on port ${httpRedirectPort}:`,
          err.message
        );
      } else {
        console.log(
          `> HTTP redirect server on http://localhost:${httpRedirectPort} -> https://localhost:${port}`
        );
        if (isValidIP(localIP)) {
          console.log(
            `> HTTP redirect server on http://${localIP}:${httpRedirectPort} -> https://${localIP}:${port}`
          );
        }
      }
    });

    // Start HTTPS server
    server.listen(port, hostname, (err) => {
      if (err) throw err;
      console.log(`> Ready on https://localhost:${port}`);
      if (isValidIP(localIP)) {
        console.log(`> Network access: https://${localIP}:${port}`);
      }
      console.log(
        `> ⚠️  You may see a security warning - this is normal for self-signed certificates`
      );
      if (isValidIP(localIP)) {
        console.log(`>    Click "Advanced" and "Proceed to ${localIP}" to continue`);
      }
      console.log(`>`);
      if (isValidIP(localIP)) {
        console.log(`> 🔥 If you can't connect from mobile device:`);
        console.log(`>    1. Make sure you use HTTPS (https://${localIP}:${port}) not HTTP`);
        console.log(`>    2. Check Windows Firewall - allow port ${port}`);
        console.log(
          `>    3. Run: netsh advfirewall firewall add rule name="Next.js HTTPS" dir=in action=allow protocol=TCP localport=${port}`
        );
      }
    });
  } else {
    // HTTP Mode (fallback when HTTPS fails or is disabled)
    const server = createHttpServer(async (req, res) => {
      const clientIP = req.socket.remoteAddress;
      console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} from ${clientIP}`);

      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error("Error occurred handling", req.url, err);
        res.statusCode = 500;
        res.end("internal server error");
      }
    });

    // Add error handlers
    server.on("error", (err) => {
      console.error("Server error:", err);
    });

    // Start HTTP server
    server.listen(port, hostname, (err) => {
      if (err) throw err;
      console.log(`> Ready on http://localhost:${port}`);
      if (isValidIP(localIP)) {
        console.log(`> Network access: http://${localIP}:${port}`);
      }
      if (!useHTTPS) {
        console.log(`> ℹ️  Running in HTTP mode (USE_HTTP=true)`);
      } else {
        console.log(`> ⚠️  Running in HTTP mode (HTTPS certificate generation failed)`);
        console.log(`>    To force HTTP mode: USE_HTTP=true npm run dev`);
      }
      console.log(`>`);
      if (isValidIP(localIP)) {
        console.log(`> 🔥 If you can't connect from mobile device:`);
        console.log(`>    1. Make sure you use HTTP (http://${localIP}:${port})`);
        console.log(`>    2. Check Windows Firewall - allow port ${port}`);
        console.log(
          `>    3. Run: netsh advfirewall firewall add rule name="Next.js HTTP" dir=in action=allow protocol=TCP localport=${port}`
        );
      }
    });
  }
});
