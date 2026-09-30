/** Recipe commands are frozen as a JSON argv array; show the same tokens as a command line. */
export function graphCommandLine(command: string): string {
  try {
    const parsed: unknown = JSON.parse(command);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string"))
      return parsed.join(" ");
  } catch {
    // Not JSON: it is already a display string.
  }
  return command;
}
