import { App, TFile, TFolder } from "obsidian";
import { InboxItem } from "./types";

export class InboxReader {
  constructor(private app: App) {}

  async readAll(inboxFolder: string): Promise<InboxItem[]> {
    const folder = this.app.vault.getAbstractFileByPath(inboxFolder);
    if (!(folder instanceof TFolder)) {
      return [];
    }

    const files = folder.children.filter(
      (f): f is TFile => f instanceof TFile && f.extension === "md"
    );

    const items: InboxItem[] = [];
    for (const file of files) {
      const item = await this.readFile(file);
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  private async readFile(file: TFile): Promise<InboxItem | null> {
    const content = await this.app.vault.read(file);
    const metadata = this.app.metadataCache.getFileCache(file);

    const frontmatter = metadata?.frontmatter ?? {};
    const bodyStart = content.indexOf("---", content.indexOf("---") + 3);
    const body = bodyStart >= 0 ? content.slice(bodyStart + 3).trim() : content;

    const summaryMatch = body.match(/## Summary\n([\s\S]*?)(?=\n## |$)/);
    const summary = summaryMatch ? summaryMatch[1].trim() : "";

    return {
      title: file.basename,
      path: file.path,
      content,
      frontmatter: {
        tags: frontmatter.tags,
        url: frontmatter.url,
        author: frontmatter.author,
        published: frontmatter.published,
        created: frontmatter.created,
      },
      summary,
      body,
    };
  }
}
