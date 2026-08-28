// Form state for the login action.
//
// This lives outside `login.ts` because that file is marked "use server", and
// such a file may only export async functions. Every one of its exports is
// published as a callable server endpoint, and a plain object cannot be one, so
// exporting `initialLoginState` from there fails at load time with
// `A "use server" file can only export async functions, found object` and takes
// the whole login page down with it.

export interface LoginState {
  error: string | null;
}

export const initialLoginState: LoginState = { error: null };
