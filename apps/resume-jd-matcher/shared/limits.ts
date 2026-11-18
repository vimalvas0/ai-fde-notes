// Limits shared by the server (enforces them) and the page (shows them).

export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_JD_CHARS = 2000;
export const MAX_INSTRUCTION_CHARS = 300;
export const MAX_RESULT_CHARS = 500;
export const RESUME_EXTENSIONS = [".pdf", ".txt", ".md"];
