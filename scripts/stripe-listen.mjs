// Local sandbox forwarding. Keep this running alongside `npm run dev`.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
process.loadEnvFile(envPath);

if (!/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? "")) {
  throw new Error("Local forwarding requires a Stripe sandbox/test key in .env.local.");
}
const origin = new URL(process.env.APP_URL ?? "http://localhost:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) || !["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
  throw new Error("Set APP_URL to your localhost origin before starting local forwarding.");
}
const target = new URL("/api/stripe-webhook", origin).toString();
const connectTarget = new URL("/api/stripe-connect-webhook", origin).toString();
const listenerArgs = [
  "listen", "--skip-update", "--color", "off", "--events-from", "all",
  "--events", "checkout.session.completed,checkout.session.async_payment_succeeded,account.updated,account.application.deauthorized",
  "--forward-to", target, "--forward-connect-to", connectTarget,
];
const windows = process.platform === "win32";
const listener = spawn(windows ? "cmd.exe" : "stripe", windows ? ["/d", "/s", "/c", `stripe ${listenerArgs.join(" ")}`] : listenerArgs, {
  cwd: root,
  // Windows npm shims run through cmd explicitly. Arguments are fixed or a validated local URL.
  shell: false,
  windowsHide: true,
  env: { ...process.env, STRIPE_API_KEY: process.env.STRIPE_SECRET_KEY },
  stdio: ["ignore", "pipe", "pipe"],
});

let savedSecret;
let updating = Promise.resolve();
function handleLine(line) {
  const secret = line.match(/whsec_[A-Za-z0-9_]+/)?.[0];
  if (secret && secret !== savedSecret) {
    savedSecret = secret;
    updating = updating.then(async () => {
      const source = await readFile(envPath, "utf8");
      let updated = source;
      for (const name of ["STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET"]) {
        const value = `${name}=${secret}`;
        const pattern = new RegExp(`^${name}=.*$`, "m");
        updated = pattern.test(updated) ? updated.replace(pattern, value) : `${updated.trimEnd()}\n${value}\n`;
      }
      if (updated !== source) await writeFile(envPath, updated);
      console.log("Local platform and Connect webhook signing secrets configured in .env.local (values hidden).");
      console.log("Keep this listener running for test purchases. Restart Next.js if it does not reload .env.local.");
    }).catch(() => {
      console.error("Could not update .env.local. Stop the listener and check file permissions.");
      listener.kill();
      process.exitCode = 1;
    });
  }
  // Never echo Stripe keys or the listener signing secret into terminal/file logs.
  console.log(line.replace(/(?:whsec_|[sr]k_(?:test|live)_)[A-Za-z0-9_]+/g, "[redacted]"));
}

createInterface({ input: listener.stdout }).on("line", handleLine);
createInterface({ input: listener.stderr }).on("line", handleLine);
listener.on("error", () => {
  console.error("Could not start the Stripe CLI. Install @stripe/cli, then run npm run stripe:listen again.");
  process.exitCode = 1;
});
listener.on("exit", (code) => { if (code) process.exitCode = code; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => listener.kill(signal));
