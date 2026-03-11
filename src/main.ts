import { Plugin } from "obsidian";

export default class InboxSecretaryPlugin extends Plugin {
  async onload() {
    console.log("Inbox Secretary loaded");
  }

  onunload() {
    console.log("Inbox Secretary unloaded");
  }
}
