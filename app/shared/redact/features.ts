/**
 * Text recognition (OCR) for photos and scanned pages is paused (ADR-0013).
 * On-device recognition has not been measured on real records yet, and a
 * misread value would reach the AI unnoticed, or slip past the leftover
 * check. Text PDFs and pasted text are read as written. The OCR code stays
 * and is still tested; set this to true to turn it back on.
 */
export const OCR_ENABLED: boolean = false
