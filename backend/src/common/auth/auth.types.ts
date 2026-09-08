export interface AuthContext {
  userId: string;
  sessionId: string;
  companyId: string;
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN";
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
