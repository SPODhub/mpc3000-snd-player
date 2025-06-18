export function sanitizeFileName(name: string): string {
  // Remove extension
  const baseName = name.replace(/\.[^/.]+$/, '');
  
  // Convert to uppercase
  const upperName = baseName.toUpperCase();
  
  // Replace non-alphanumeric characters with underscores
  const sanitized = upperName.replace(/[^A-Z0-9]/g, '_');
  
  // Truncate to 12 characters
  const truncated = sanitized.slice(0, 12);
  
  // If empty after sanitization, use a default name
  return truncated || 'SAMPLE';
} 