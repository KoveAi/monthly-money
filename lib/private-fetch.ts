"use client";

export async function privateFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, { ...init, cache: "no-store" });
  if (response.status === 401 || response.status === 503) {
    window.location.replace("/login");
    throw new Error("Please sign in to continue.");
  }
  return response;
}
