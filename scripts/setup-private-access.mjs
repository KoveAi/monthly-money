#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";

// Run locally, in a private terminal. Never commit or share the generated values.
const accessCode = randomBytes(24).toString("base64url");
console.log("Save this household access code in your password manager:");
console.log(accessCode);
console.log("\nAdd these server-only environment variables to Vercel (Production), then redeploy:");
console.log(`MONTHLY_MONEY_ACCESS_CODE_HASH=${createHash("sha256").update(accessCode).digest("hex")}`);
console.log(`MONTHLY_MONEY_SESSION_SECRET=${randomBytes(32).toString("hex")}`);
console.log("MONTHLY_MONEY_ORIGIN=https://monthly-money-psi.vercel.app");
console.log("\nDo not use NEXT_PUBLIC_ prefixes. Rotating either credential signs out all sessions.");
