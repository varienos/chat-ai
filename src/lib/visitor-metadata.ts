import { UAParser } from "ua-parser-js";
import geoip from "geoip-lite";

import type { VisitorMetadata } from "../domain/chat-session.js";

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip: string;
}

export function extractVisitorMetadata(request: RequestLike): VisitorMetadata {
  const ip = request.ip;
  const rawUA = (Array.isArray(request.headers["user-agent"])
    ? request.headers["user-agent"][0]
    : request.headers["user-agent"]) ?? "";

  const parser = new UAParser(rawUA);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();

  let country: string | null = null;
  let city: string | null = null;

  try {
    const geo = geoip.lookup(ip);
    if (geo) {
      country = geo.country || null;
      city = geo.city || null;
    }
  } catch (err) {
    console.error("[visitor-metadata] geoip lookup failed for ip:", ip, err instanceof Error ? err.message : err);
  }

  const browserName = browser.name && browser.version
    ? `${browser.name} ${browser.version}`
    : browser.name || null;

  const osName = os.name && os.version
    ? `${os.name} ${os.version}`
    : os.name || null;

  const deviceType = device.type || "desktop";

  return {
    browser: browserName,
    city,
    country,
    deviceType,
    ip,
    os: osName,
    userAgent: rawUA,
  };
}
