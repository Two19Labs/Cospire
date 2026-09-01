import type { NewUserFieldErrors } from "../user-input";

// Kept out of `create-user.ts` because that file is marked "use server", where
// every export is published as a callable endpoint and so must be an async
// function. Exporting the initial state object from there fails at load time
// with `A "use server" file can only export async functions, found object` and
// takes the whole page down -- exactly the defect that broke the login page in
// Phase 0.

export interface CreateUserState {
  error: string | null;
  fieldErrors: NewUserFieldErrors;
}

export const initialCreateUserState: CreateUserState = {
  error: null,
  fieldErrors: {},
};
