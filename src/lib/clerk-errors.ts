type ClerkErrorLike = {
  message: string;
  longMessage?: string;
};

export function getClerkErrorMessage(error: ClerkErrorLike | null | undefined): string | undefined {
  if (!error) return undefined;
  return error.longMessage ?? error.message;
}
