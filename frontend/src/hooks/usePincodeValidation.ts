import { useCallback, useRef, useState } from "react";

export interface PincodeData {
  district: string;
  state: string;
  city: string;
}

interface PostOffice {
  District: string;
  Division: string;
  State: string;
  Name: string;
  Block: string;
  Region: string;
  Taluk?: string;
}

interface PincodeApiResponse {
  Status: string;
  PostOffice: PostOffice[] | null;
}

export function usePincodeValidation() {
  const [pincodeData, setPincodeData] = useState<PincodeData | null>(null);
  const [pincodeError, setPincodeError] = useState<string | null>(null);
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lookupPincode = useCallback((pincode: string) => {
    const cleaned = pincode.replace(/\D/g, "");
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (cleaned.length !== 6) {
      setPincodeData(null);
      setPincodeError(null);
      setPincodeLoading(false);
      return;
    }

    setPincodeLoading(true);
    setPincodeError(null);
    setPincodeData(null);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${cleaned}`);
        const json = (await res.json()) as PincodeApiResponse[];
        const result = json[0];
        if (result?.Status === "Success" && result.PostOffice && result.PostOffice.length > 0) {
          const po = result.PostOffice[0];
          const city = po.Division || po.Block || po.Name || po.District;
          setPincodeData({
            district: po.District,
            state: po.State,
            city,
          });
          setPincodeError(null);
        } else {
          setPincodeData(null);
          setPincodeError("Invalid pincode — not found in postal records");
        }
      } catch {
        setPincodeData(null);
        setPincodeError("Could not verify pincode. Check your connection.");
      } finally {
        setPincodeLoading(false);
      }
    }, 500);
  }, []);

  const resetPincode = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPincodeData(null);
    setPincodeError(null);
    setPincodeLoading(false);
  }, []);

  return { lookupPincode, pincodeData, pincodeError, pincodeLoading, resetPincode };
}
