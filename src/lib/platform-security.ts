/** O painel da plataforma pede login de novo quando o último passou deste tempo. */
export const PLATFORM_SESSION_MAX_MINUTES = 60;

/**
 * Login recente? O Clerk informa há quantos minutos a pessoa confirmou a senha (ou entrou pelo
 * Google): `factorVerificationAge[0]`; -1 ou ausente = não sabe, então não é recente.
 */
export function isFreshSignIn(
  factorVerificationAge: readonly [number, number] | null | undefined,
  maxMinutes = PLATFORM_SESSION_MAX_MINUTES,
): boolean {
  const firstFactorAge = factorVerificationAge?.[0];
  return typeof firstFactorAge === 'number' && firstFactorAge >= 0 && firstFactorAge < maxMinutes;
}

/** "Chrome no Windows", "Safari no iPhone"… a partir do user-agent do navegador. */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Aparelho desconhecido';
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Navegador';
  const system = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  return system ? `${browser} no ${system}` : browser;
}
