export function getEnvVar(
  variable: string,
  opts?: {
    default?: string;
  }
) {
  const envVar = process.env[variable] || opts?.default;
  if (!envVar) {
    const msg = `Variable ${variable} not set!`;
    console.error(msg);
    throw new Error(msg);
  }
  return envVar;
}
