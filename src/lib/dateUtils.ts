/**
 * Safe date parsing and validation utilities
 */

/**
 * Safely parse a date string or Date object
 * @param dateInput - Date string, Date object, or null
 * @returns Parsed Date or null if invalid
 */
export function parseDate(dateInput: string | Date | null | undefined): Date | null {
  if (!dateInput) return null;
  
  try {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    
    if (isNaN(date.getTime())) {
      console.error('Invalid date:', dateInput);
      return null;
    }
    
    return date;
  } catch (error) {
    console.error('Error parsing date:', dateInput, error);
    return null;
  }
}

/**
 * Validate a date range
 * @param startDate - Start date
 * @param endDate - End date
 * @returns true if valid, false otherwise
 */
export function validateDateRange(
  startDate: string | Date | null,
  endDate: string | Date | null
): { valid: boolean; error?: string } {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  
  if (!start || !end) {
    return { valid: false, error: 'Invalid date range' };
  }
  
  if (start > end) {
    return { valid: false, error: 'Start date must be before end date' };
  }
  
  return { valid: true };
}

/**
 * Check if date input type is supported
 * @returns true if date input is supported
 */
export function isDateInputSupported(): boolean {
  const input = document.createElement('input');
  input.setAttribute('type', 'date');
  return input.type === 'date';
}
