import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const API = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/couple";

interface CoupleContextValue {
  isLinked: boolean;
  coupleId: string | null;
  partnerId: string | null;
  partnerName: string | null;
  partnerAvatar: string | null;
  loading: boolean;
  refresh: () => void;
}

const CoupleContext = createContext<CoupleContextValue>({
  isLinked: false,
  coupleId: null,
  partnerId: null,
  partnerName: null,
  partnerAvatar: null,
  loading: true,
  refresh: () => {},
});

export function CoupleProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [isLinked, setIsLinked] = useState(false);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [partnerAvatar, setPartnerAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!userId) {
      setIsLinked(false);
      setCoupleId(null);
      setPartnerId(null);
      setPartnerName(null);
      setPartnerAvatar(null);
      setLoading(false);
      return;
    }
    fetch(`${API}/status?userId=${encodeURIComponent(userId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: any) => {
        if (data?.status === "coupled") {
          setIsLinked(true);
          setCoupleId(data.couple?.id ?? null);
          const partner = data.partner ?? null;
          setPartnerId(partner?.id ?? null);
          setPartnerName(partner?.full_name || partner?.username || null);
          setPartnerAvatar(partner?.avatar_url ?? null);
        } else {
          setIsLinked(false);
          setCoupleId(null);
          setPartnerId(null);
          setPartnerName(null);
          setPartnerAvatar(null);
        }
      })
      .catch(() => {
        setIsLinked(false);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <CoupleContext.Provider value={{ isLinked, coupleId, partnerId, partnerName, partnerAvatar, loading, refresh }}>
      {children}
    </CoupleContext.Provider>
  );
}

export function useCoupleStatus() {
  return useContext(CoupleContext);
}
