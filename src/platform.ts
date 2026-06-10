import { invoke } from "@tauri-apps/api/core";

let cached: Promise<string> | null = null;

export function getPlatform(): Promise<string> {
  if (!cached) cached = invoke<string>("get_platform").catch(() => "linux");
  return cached;
}

export async function isAndroid(): Promise<boolean> {
  return (await getPlatform()) === "android";
}
