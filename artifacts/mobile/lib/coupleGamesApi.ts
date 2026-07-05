const BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "").replace(/\/$/, "") + "/api/couple-games";

async function apiCall<T = any>(path: string, method = "GET", body?: object): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "API error");
  return json as T;
}

export interface BattleSummary {
  id: string;
  status: "pending" | "active" | "completed" | "declined" | "expired";
  game_type: string;
  iAmChallenger: boolean;
  isMyTurn: boolean;
  opponentCoupleName: string;
  opponentCoupleId: string;
  myAnswerCount: number;
  totalQuestions: number;
  winner_couple_id: string | null;
  iWon: boolean;
  isTie: boolean;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
}

export interface BattleQuestion {
  id: string;
  text: string;
  option_a: string;
  option_b: string;
}

export interface PerQuestionResult {
  questionId: string;
  text: string;
  option_a: string;
  option_b: string;
  myAnswer_requester: "A" | "B" | null;
  myAnswer_receiver: "A" | "B" | null;
  myMatched: boolean;
}

export interface BattleResults {
  status: string;
  myScore: number;
  theirScore: number;
  totalQuestions: number;
  iWon: boolean;
  isTie: boolean;
  myCoupleName: string;
  theirCoupleName: string;
  perQuestion: PerQuestionResult[];
  completedAt: string | null;
}

export interface CoupleSearchResult {
  coupleId: string;
  partner1: { id: string; name: string; username: string; avatar_url: string | null };
  partner2: { id: string; name: string; username: string; avatar_url: string | null };
}

export async function listMyBattles(userId: string): Promise<{ battles: BattleSummary[]; myCoupleId: string }> {
  return apiCall(`/battles?userId=${encodeURIComponent(userId)}`);
}

export async function createChallenge(challengerUserId: string, opponentCoupleId: string) {
  return apiCall("/challenge", "POST", { challengerUserId, opponentCoupleId });
}

export async function respondToBattle(battleId: string, userId: string, accept: boolean) {
  return apiCall(`/battles/${battleId}/respond`, "POST", { userId, accept });
}

export async function getBattleQuestions(
  battleId: string,
  userId: string
): Promise<{ questions: BattleQuestion[]; myAnswers: Record<string, "A" | "B">; status: string }> {
  return apiCall(`/battles/${battleId}/questions?userId=${encodeURIComponent(userId)}`);
}

export async function submitAnswer(battleId: string, userId: string, questionId: string, answer: "A" | "B") {
  return apiCall(`/battles/${battleId}/answers`, "POST", { userId, questionId, answer });
}

export async function getBattleResults(battleId: string, userId: string): Promise<BattleResults> {
  return apiCall(`/battles/${battleId}/results?userId=${encodeURIComponent(userId)}`);
}

export async function searchCouples(userId: string, q: string): Promise<{ couples: CoupleSearchResult[] }> {
  return apiCall(`/couples/search?userId=${encodeURIComponent(userId)}&q=${encodeURIComponent(q)}`);
}
