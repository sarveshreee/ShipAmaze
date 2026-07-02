export type CourierBrand = {
  color: string;
  logo: string;
  initials: string;
};

/** Match Velocity labels like "Delhivery Standard", "Xpressbees Standard", "Amazon Transportation". */
const COURIER_BRANDS: Array<{
  keys: string[];
  color: string;
  logo: string;
}> = [
  { keys: ["delhivery"], color: "#E4002B", logo: "/couriers/delhivery.svg" },
  { keys: ["amazon"], color: "#FF9900", logo: "/couriers/amazon.svg" },
  { keys: ["xpressbees", "xpress"], color: "#F26522", logo: "/couriers/xpressbees.svg" },
  { keys: ["ekart"], color: "#2874F0", logo: "/couriers/ekart.svg" },
  { keys: ["dtdc"], color: "#004B87", logo: "/couriers/dtdc.svg" },
  { keys: ["shadowfax"], color: "#6C2BD9", logo: "/couriers/shadowfax.svg" },
  { keys: ["bluedart", "blue dart"], color: "#003DA5", logo: "/couriers/bluedart.svg" },
];

function normalizeCourierKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchBrand(name: string) {
  const key = normalizeCourierKey(name);
  const lower = name.trim().toLowerCase();
  for (const brand of COURIER_BRANDS) {
    if (brand.keys.some((k) => key.includes(k.replace(/\s/g, "")) || lower.includes(k))) {
      return brand;
    }
  }
  return null;
}

export function resolveCourierBrand(name: string): CourierBrand {
  const token = name.trim().split(/\s+/)[0] ?? name;
  const initials = token.slice(0, 2).toUpperCase();
  const matched = matchBrand(name);
  if (matched) {
    return { color: matched.color, logo: matched.logo, initials };
  }
  return { color: "#64748b", logo: "", initials };
}

export type VelocityCourierOption = {
  carrier_id: string;
  carrier_name: string;
};
