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

export interface TriageResult {
  userSummary: string;
  items: TriageItem[];
}

export interface TriageItem {
  title: string;
  category: "high" | "low";
  reason: string;
}

export interface DigestEntry {
  title: string;
  insight: string;
  action: string;
  sourceUrl?: string;
}
