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
  updatedMemory: string;
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

export interface SecretaryMemory {
  content: string;
  lastUpdated: string;
}

export interface TriageLog {
  date: string;
  items: {
    title: string;
    tags: string[];
    category: "high" | "low";
    reason: string;
  }[];
}
