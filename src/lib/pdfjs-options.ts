export const PDFJS_STANDARD_FONT_DATA_URL = '/pdfjs/standard_fonts/';

export function pdfJsDocumentOptions(data: Uint8Array) {
  return { data, standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL };
}
