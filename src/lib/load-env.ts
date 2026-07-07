declare const Bun:
  | {
      file: (path: string) => {
        text: () => Promise<string>;
      };
    }
  | undefined;

declare const process: {
  env: Record<string, string | undefined>;
};

function parseEnvLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex <= 0) return undefined;

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return key ? [key, value] : undefined;
}

const envUrl = new URL("../../.env.local", import.meta.url);

if (typeof Bun !== "undefined") {
  try {
    const contents = await Bun.file(decodeURIComponent(envUrl.pathname).replace(/^\//, "")).text();
    for (const line of contents.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;

      const [key, value] = parsed;
      if (process.env[key] == null) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing or unreadable env files.
  }
}