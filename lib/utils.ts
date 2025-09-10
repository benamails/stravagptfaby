// lib/utils.ts
// Fonctions utilitaires pour les routes API : génération d'IDs, dates, réponses JSON/HTML.

import { NextResponse } from "next/server";

// --------- Génération de reqId (logs) ---------
export function genReqId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// --------- Dates & plages ---------
/**
 * Retourne le timestamp "after" pour Strava (dernier X jours).
 * @param days nombre de jours (par défaut: 28)
 */
export function getAfterTimestamp(days = 28): number {
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  return Math.floor(ms / 1000);
}

// --------- Réponses JSON ---------
export function jsonOk(data: any, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(message: string, status = 500, meta?: any) {
  return NextResponse.json(
    { ok: false, error: message, ...(meta || {}) },
    { status }
  );
}

// --------- HTML fallback ---------
export function renderFallbackHtml(msg = "Finalisation… Retour automatique indisponible.") {
  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OAuth Callback</title>
</head>
<body>
  <p>${msg}</p>
</body>
</html>`,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}
