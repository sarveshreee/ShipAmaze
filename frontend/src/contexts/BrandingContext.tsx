import { createContext, useContext, useState, ReactNode } from "react";
import { BRAND_LOGO } from "@/lib/brandAssets";

export interface TrackingBranding {
  brandName: string;
  logoUrl: string;
  primaryColor: string;
  bgColor: string;
  accentColor: string;
  headerText: string;
  subText: string;
  footerText: string;
  showBranding: boolean;
  buttonStyle: 'rounded' | 'square' | 'pill';
}

export const defaultBranding: TrackingBranding = {
  brandName: 'ShipAmaze',
  logoUrl: BRAND_LOGO,
  primaryColor: '#4F46E5',
  bgColor: '#F8FAFC',
  accentColor: '#10B981',
  headerText: 'Track Your Shipment',
  subText: 'Enter your AWB or Order ID below',
  footerText: 'Powered by ShipAmaze',
  showBranding: true,
  buttonStyle: 'rounded',
};

interface BrandingContextType {
  branding: TrackingBranding;
  setBranding: (b: TrackingBranding) => void;
  updateBranding: (key: keyof TrackingBranding, value: string | boolean) => void;
}

const BrandingContext = createContext<BrandingContextType>({
  branding: defaultBranding,
  setBranding: () => {},
  updateBranding: () => {},
});

export const useBranding = () => useContext(BrandingContext);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<TrackingBranding>(() => {
    try {
      const saved = localStorage.getItem('tracking_branding');
      return saved ? { ...defaultBranding, ...JSON.parse(saved) } : defaultBranding;
    } catch { return defaultBranding; }
  });

  const updateBranding = (key: keyof TrackingBranding, value: string | boolean) => {
    setBranding(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('tracking_branding', JSON.stringify(next));
      return next;
    });
  };

  const setFullBranding = (b: TrackingBranding) => {
    setBranding(b);
    localStorage.setItem('tracking_branding', JSON.stringify(b));
  };

  return (
    <BrandingContext.Provider value={{ branding, setBranding: setFullBranding, updateBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}
