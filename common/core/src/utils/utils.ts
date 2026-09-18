export function getEnvVar(
  variable: string,
  opts?: {
    default?: string;
  }
) {
  const envVar = process.env[variable] ?? opts?.default;
  if (envVar === undefined) {
    const msg = `Variable ${variable} not set!`;
    console.error(msg);
    throw new Error(msg);
  }
  return envVar;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
