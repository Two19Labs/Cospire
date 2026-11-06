// Kept out of the "use server" file, which may export async functions only
// (see `login-state.ts`).
export interface AccountFormState {
  error: string | null;
  sent: boolean;
}

export const initialAccountFormState: AccountFormState = { error: null, sent: false };
