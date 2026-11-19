/** JSON-тело запроса как объект: массивы и не-JSON считаются отсутствующим телом. */
export async function bodyJson(c: { req: { json: () => Promise<unknown> } }): Promise<any | null> {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
