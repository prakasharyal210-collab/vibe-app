import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const API = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/couple";

interface CoupleProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  full_name: string | null;
}

interface PendingRequest {
  id: string;
  requester_id: string;
  requester: CoupleProfile | null;
}

export type CoupleStatusType = "none" | "pending_sent" | "pending_received" | "coupled";

interface CoupleContextValue {
  coupleStatus: CoupleStatusType;
  isLinked: boolean;
  coupleId: string | null;
  partnerId: string | null;
  partnerName: string | null;
  partnerAvatar: string | null;
  pendingSent: { id: string; receiver_id: string; receiver: CoupleProfile | null } | null;
  pendingReceived: PendingRequest[];
  loading: boolean;
  refresh: () => void;
}

const CoupleContext = createContext<CoupleContextValue>({
  coupleStatus: "none",
  isLinked: false,
  coupleId: null,
  partnerId: null,
  partnerName: null,
  partnerAvatar: null,
  pendingSent: null,
  pendingReceived: [],
  loading: true,
  refresh: () => {},
});

export function CoupleProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [coupleStatus, setCoupleStatus] = useState<CoupleStatusType>("none");
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [partnerAvatar, setPartnerAvatar] = useState<string | null>(null);
  const [pendingSent, setPendingSent] = useState<CoupleContextValue["pendingSent"]>(null);
  const [pendingReceived, setPendingReceived] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!userId) {
      setCoupleStatus("none");
      setCoupleId(null);
      setPartnerId(null);
      setPartnerName(null);
      setPartnerAvatar(null);
      setPendingSent(null);
      setPendingReceived([]);
      setLoading(false);
      return;
    }
    fetch(`${API}/status?userId=${encodeURIComponent(userId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: any) => {
        if (!data) return;
        if (data.status === "coupled") {
          setCoupleStatus("coupled");
          setCoupleId(data.couple?.id ?? null);
          const partner = data.partner ?? null;
          setPartnerId(partner?.id ?? null);
          setPartnerName(partner?.full_name || partner?.username || null);
          setPartnerAvatar(partner?.avatar_url ?? null);
          setPendingSent(null);
          setPendingReceived([]);
        } else if (data.status === "pending_sent") {
          setCoupleStatus("pending_sent");
          setCoupleId(null);
          setPartnerId(null);
          setPartnerName(null);
          setPartnerAvatar(null);
          setPendingSent({ id: data.pending?.id, receiver_id: data.pending?.receiver_id, receiver: data.receiver ?? null });
          setPendingReceived([]);
        } else if (data.status === "pending_received") {
          setCoupleStatus("pending_received");
          setCoupleId(null);
          setPartnerId(null);
          setPartnerName(null);
          setPartnerAvatar(null);
          setPendingSent(null);
          setPendingReceived(data.pendingRequests ?? []);
        } else {
          setCoupleStatus("none");
          setCoupleId(null);
          setPartnerId(null);
          setPartnerName(null);
          setPartnerAvatar(null);
          setPendingSent(null);
          setPendingReceived([]);
        }
      })
      .catch(() => {
        setCoupleStatus("none");
      })
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <CoupleContext.Provider
      value={{
        coupleStatus,
        isLinked: coupleStatus === "coupled",
        coupleId,
        partnerId,
        partnerName,
        partnerAvatar,
        pendingSent,
        pendingReceived,
        loading,
        refresh,
      }}
    >
      {children}
    </CoupleContext.Provider>
  );
}

export function useCoupleStatus() {
  return useContext(CoupleContext);
}
