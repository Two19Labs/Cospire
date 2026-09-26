// Whether a request comes from a phone, read from its User-Agent on the server.
//
// A browser can claim to be anything, so this is not proof: a phone in "desktop
// site" mode reads as a desktop. What it does guarantee is that an ordinary
// phone attempt is marked unproctored by the server, not by a setting the
// student chooses. Tablets count as phones: they are no easier to proctor.
export function isPhone(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return /Mobi|Android|iPhone|iPad|iPod|Windows Phone|Opera Mini|IEMobile/i.test(userAgent);
}
