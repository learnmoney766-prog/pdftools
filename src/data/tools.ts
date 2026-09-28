import toolData from './tools-data.json';

export type ToolCategory = 'PDF organization' | 'PDF conversion' | 'PDF optimization' | 'PDF information' | 'PDF editing';
export type ToolSlug =
  | 'merge-pdf' | 'split-pdf' | 'extract-pdf-pages' | 'delete-pdf-pages' | 'reorder-pdf-pages' | 'rotate-pdf'
  | 'jpg-to-pdf' | 'png-to-pdf' | 'pdf-to-jpg' | 'pdf-to-png' | 'pdf-to-word' | 'pdf-to-excel' | 'pdf-to-powerpoint' | 'compress-pdf'
  | 'pdf-page-counter' | 'pdf-metadata' | 'pdf-text-extractor' | 'add-page-numbers' | 'add-watermark';

export interface ToolSpec {
  slug: ToolSlug;
  title: string;
  shortTitle: string;
  category: ToolCategory;
  description: string;
  intro: string;
  howTo: string[];
  faqs: { question: string; answer: string }[];
  related: ToolSlug[];
  accept: 'pdf' | 'jpg' | 'png';
  multiple: boolean;
}

export const tools = toolData as unknown as ToolSpec[];
export const categories: ToolCategory[] = ['PDF organization', 'PDF conversion', 'PDF optimization', 'PDF information', 'PDF editing'];
export const toolBySlug = (slug: string | undefined) => tools.find((tool) => tool.slug === slug);
export const toolHref = (slug: ToolSlug) => `/${slug}`;
