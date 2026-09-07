export function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: unknown; statusText?: string } }).response;
    const data = response?.data;

    if (typeof data === "string") {
      // HTML error page from Express or web server
      if (data.includes("<pre>")) {
        const match = data.match(/<pre>(.*?)<\/pre>/s);
        if (match) {
          return match[1].replace(/<[^>]+>/g, "").split("\n")[0].replace(/^Error:\s*/i, "").trim();
        }
      }
      const trimmed = data.trim();
      if (trimmed.length > 0 && trimmed.length < 200) return trimmed;
    }

    if (typeof data === "object" && data !== null) {
      const d = data as { error?: unknown; message?: unknown };
      const apiError = d.error ?? d.message;

      if (typeof apiError === "string") return apiError;

      if (typeof apiError === "object" && apiError !== null) {
        const { formErrors, fieldErrors } = apiError as {
          formErrors?: string[];
          fieldErrors?: Record<string, string[]>;
        };
        if (formErrors && formErrors.length > 0) {
          return formErrors.join(", ");
        }
        if (fieldErrors) {
          const messages = Object.entries(fieldErrors)
            .map(([field, errs]) => `${field}: ${Array.isArray(errs) ? errs.join(", ") : String(errs)}`);
          if (messages.length > 0) return messages.join("; ");
        }
      }

      if (response?.statusText) return response.statusText;
    }

    return "Request failed validation";
  }

  return error instanceof Error ? error.message : "Something went wrong";
}
