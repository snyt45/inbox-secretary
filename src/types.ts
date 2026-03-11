export interface InboxItem {
  title: string;
  path: string;
  content: string;
  frontmatter: {
    tags?: string[];
    url?: string;
    author?: string[];
    published?: string;
    created?: string;
  };
  summary: string;
  body: string;
}

export interface DigestEntry {
  title: string;
  summary: string;
  recommendation: string;
  sourceUrl?: string;
}

export interface DailyDigest {
  date: string;
  entries: DigestEntry[];
  context: string;
}
