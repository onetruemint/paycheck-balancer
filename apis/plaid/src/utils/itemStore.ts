// TODO: this is in-memory only and is lost on every restart. Replace with a
// real persistence layer (DB) once one exists for this service; see the
// equivalent TODO this replaces in controller.ts's old getAccessToken.
const accessTokensByItemId = new Map<string, string>();

export function saveAccessToken(itemId: string, accessToken: string): void {
  accessTokensByItemId.set(itemId, accessToken);
}

export function getAccessTokenForItem(itemId: string): string | undefined {
  return accessTokensByItemId.get(itemId);
}
