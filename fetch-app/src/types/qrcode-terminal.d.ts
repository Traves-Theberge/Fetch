/**
 * @fileoverview QR Code Terminal Type Declarations
 * 
 * TypeScript type declarations for the qrcode-terminal package,
 * which provides QR code generation for terminal/console output.
 * Used for WhatsApp Web authentication QR code display.
 * 
 * @module types/qrcode-terminal
 * @see {@link https://www.npmjs.com/package/qrcode-terminal} NPM package
 */

declare module 'qrcode-terminal' {
  /**
   * Generate and print a QR code to the terminal.
   * 
   * @param text - The text/URL to encode in the QR code
   * @param options - Optional configuration
   * @param options.small - If true, generates a smaller QR code
   */
  export function generate(text: string, options?: { small?: boolean }): void;
  
  /**
   * Set the error correction level for QR code generation.
   * 
   * @param level - Error correction level:
   *   - 'L' = Low (~7% correction)
   *   - 'M' = Medium (~15% correction)
   *   - 'Q' = Quartile (~25% correction)
   *   - 'H' = High (~30% correction)
   */
  export function setErrorLevel(level: 'L' | 'M' | 'Q' | 'H'): void;
}
