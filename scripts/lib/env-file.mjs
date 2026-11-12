// Reads a dotenv file into a plain object without touching process.env.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";

export function readEnvFile(file) {
  if (!existsSync(file)) throw new Error(`${file} does not exist.`);
  return parseEnv(readFileSync(file, "utf8"));
}

/** Sets one variable in a dotenv file, replacing an existing line or appending one. */
export function setEnvVar(file, name, value) {
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const line = `${name}="${value}"`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  const next = pattern.test(text) ? text.replace(pattern, line) : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  writeFileSync(file, next, { mode: 0o600 });
}
