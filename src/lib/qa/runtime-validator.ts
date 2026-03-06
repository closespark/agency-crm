import { prisma } from "@/lib/prisma";
import { cacheGet } from "@/lib/redis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  direction: "outbound" | "inbound";
  apiName: string;
  endpoint: string;
  issues: string[];
  timestamp: string;
}

interface EndpointDocSnapshot {
  method: string;
  path: string;
  requiredFields: string[];
  optionalFields: string[];
  responseShape: Record<string, string>;
}

interface ApiDocSnapshot {
  apiName: string;
  endpoints: EndpointDocSnapshot[];
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Log a validation failure to the RawEventLog table for observability.
 */
export async function logValidationFailure(
  direction: "outbound" | "inbound",
  apiName: string,
  endpoint: string,
  issues: string[]
): Promise<void> {
  try {
    await prisma.rawEventLog.create({
      data: {
        source: "qa_runtime",
        eventType: `validation_${direction}_failure`,
        rawPayload: JSON.stringify({
          apiName,
          endpoint,
          direction,
          issues,
          timestamp: new Date().toISOString(),
        }),
        processed: false,
      },
    });
  } catch (err) {
    // Logging failures should never break the calling code
    console.error(
      `[qa_runtime] Failed to log validation failure for ${apiName} ${endpoint}:`,
      err
    );
  }
}

/**
 * Validate that all required fields are present in a payload object.
 * Returns a list of issues found (empty if valid).
 */
function validatePayloadFields(
  payload: unknown,
  requiredFields: string[]
): string[] {
  const issues: string[] = [];

  if (payload === null || payload === undefined) {
    if (requiredFields.length > 0) {
      issues.push(
        `Payload is ${payload === null ? "null" : "undefined"} but required fields expected: ${requiredFields.join(", ")}`
      );
    }
    return issues;
  }

  if (typeof payload !== "object" || Array.isArray(payload)) {
    issues.push(
      `Payload is not a plain object (got ${Array.isArray(payload) ? "array" : typeof payload})`
    );
    return issues;
  }

  const payloadKeys = new Set(Object.keys(payload as Record<string, unknown>));

  for (const field of requiredFields) {
    if (!payloadKeys.has(field)) {
      issues.push(`Missing required field: "${field}"`);
    }
  }

  return issues;
}

/**
 * Validate a response object against an expected shape definition.
 * The shape maps field names to expected type strings (e.g. "string", "number", "object").
 * Returns a list of issues found (empty if valid).
 */
function validateResponseShape(
  response: unknown,
  expectedShape: Record<string, string>
): string[] {
  const issues: string[] = [];

  if (response === null || response === undefined) {
    issues.push("Response is null or undefined");
    return issues;
  }

  if (typeof response !== "object" || Array.isArray(response)) {
    issues.push(
      `Response is not a plain object (got ${Array.isArray(response) ? "array" : typeof response})`
    );
    return issues;
  }

  const responseObj = response as Record<string, unknown>;

  for (const [field, expectedType] of Object.entries(expectedShape)) {
    if (!(field in responseObj)) {
      issues.push(`Missing expected response field: "${field}"`);
      continue;
    }

    const actualValue = responseObj[field];
    const actualType = actualValue === null ? "null" : typeof actualValue;

    if (expectedType === "array") {
      if (!Array.isArray(actualValue)) {
        issues.push(
          `Field "${field}": expected array, got ${actualType}`
        );
      }
    } else if (actualType !== expectedType) {
      issues.push(
        `Field "${field}": expected ${expectedType}, got ${actualType}`
      );
    }
  }

  return issues;
}

/**
 * Look up the endpoint doc snapshot from the cache.
 */
async function getEndpointDoc(
  apiName: string,
  endpoint: string
): Promise<EndpointDocSnapshot | null> {
  const docSnapshot = await cacheGet<ApiDocSnapshot>(`api_docs:${apiName}`);
  if (!docSnapshot) return null;

  return (
    docSnapshot.endpoints.find(
      (ep) => ep.path === endpoint || endpoint.includes(ep.path)
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Main validation wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap an API call with outbound and inbound validation.
 *
 * - Validates the outbound payload against cached API documentation.
 * - Executes the actual API call via the provided `callFn`.
 * - Validates the response shape if `expectedResponseShape` is provided.
 * - Logs any validation failures to RawEventLog (never throws on validation
 *   issues — the call proceeds and data is returned even if validation fails).
 *
 * @param apiName - Identifier for the API (e.g. "apollo", "instantly").
 * @param endpoint - The specific endpoint path being called.
 * @param payload - The outbound request payload.
 * @param callFn - The function that actually performs the API call.
 * @param expectedResponseShape - Optional map of field names to expected types
 *   for response validation.
 * @returns The API response data.
 */
export async function callWithValidation<T>(
  apiName: string,
  endpoint: string,
  payload: unknown,
  callFn: () => Promise<T>,
  expectedResponseShape?: Record<string, string>
): Promise<T> {
  // --- Outbound validation ---
  const endpointDoc = await getEndpointDoc(apiName, endpoint);

  if (endpointDoc) {
    const outboundIssues = validatePayloadFields(
      payload,
      endpointDoc.requiredFields
    );

    if (outboundIssues.length > 0) {
      await logValidationFailure("outbound", apiName, endpoint, outboundIssues);
    }
  }

  // --- Execute the API call ---
  const response = await callFn();

  // --- Inbound validation ---
  const shapeToValidate =
    expectedResponseShape ?? endpointDoc?.responseShape;

  if (shapeToValidate) {
    const inboundIssues = validateResponseShape(response, shapeToValidate);

    if (inboundIssues.length > 0) {
      await logValidationFailure("inbound", apiName, endpoint, inboundIssues);
    }
  }

  return response;
}
