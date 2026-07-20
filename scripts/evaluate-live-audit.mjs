#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { evaluate } from "./lib/evaluate-audit.mjs";

const args = process.argv.slice(2);
const usage = "Usage: node scripts/evaluate-live-audit.mjs [--gate] <route-response.json> <ground-truth.server.json>";

const gateCount = args.filter((arg) => arg === "--gate").length;
const positionals = args.filter((arg) => arg !== "--gate");
const invalidFlags = positionals.filter((arg) => arg.startsWith("--"));

// Supported shapes (exactly):
//   node scripts/evaluate-live-audit.mjs <route-response.json> <ground-truth.server.json>
//   node scripts/evaluate-live-audit.mjs --gate <route-response.json> <ground-truth.server.json>
// Everything else (extra positionals, unknown flags, duplicate --gate, --gate
// without exactly two paths) is invalid usage and exits 2.
if (gateCount > 1 || invalidFlags.length > 0 || positionals.length !== 2) {
  console.error(usage);
  process.exit(2);
}

const [responsePath, groundTruthPath] = positionals;
const gateMode = gateCount === 1;

let response;
let groundTruth;
try {
  response = JSON.parse(readFileSync(responsePath, "utf8"));
  groundTruth = JSON.parse(readFileSync(groundTruthPath, "utf8"));
} catch (error) {
  console.error(`Failed to read evaluation inputs: ${error.message}`);
  process.exit(2);
}

let result;
try {
  result = evaluate({ response, groundTruth });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const json = JSON.stringify(result, null, 2);

if (gateMode) {
  process.stdout.write(`${json}\n`);
  process.exit(result.gate.pass ? 0 : 1);
}

process.stdout.write(`${json}\n`);
process.exit(0);
