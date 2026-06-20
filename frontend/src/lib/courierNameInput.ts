/** Letters and spaces only — Ekart/Velocity contact person first name. */
export function restrictCourierPersonNameInput(value: string): string {
  return value.replace(/[^a-zA-Z\s]/g, "");
}

/** Letters, digits, and spaces — warehouse/pickup label for Velocity. */
export function restrictCourierWarehouseNameInput(value: string): string {
  return value.replace(/[^a-zA-Z0-9\s]/g, "");
}
