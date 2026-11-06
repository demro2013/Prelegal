import { apiRequest } from "./api";

export type Account = { email: string };

export type Credentials = { email: string; password: string };

export const MIN_PASSWORD_LENGTH = 10;

export function fetchAccount(): Promise<Account> {
  return apiRequest("/auth/me");
}

export function logIn(body: Credentials): Promise<Account> {
  return apiRequest("/auth/login", { method: "POST", body });
}

export function signUp(body: Credentials): Promise<Account> {
  return apiRequest("/auth/signup", { method: "POST", body });
}

export function logOut(): Promise<void> {
  return apiRequest("/auth/logout", { method: "POST" });
}
