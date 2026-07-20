#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { evaluate } from "./lib/evaluate-audit.mjs";

const args = process.argv.slice(2);
const gateMode = args.includes("--gate");
const positional = args.filter((arg) => arg !== "--gate");
const [responsePath, groundTruthPath] = positional;

if (!responsePath || !groundTruthPath) {
  console.error("Usage: node scripts/evaluate-live-audit.mjs [--gate] <route-response.json> <ground-truth.server.json>");
  process.exit(2);
}

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
