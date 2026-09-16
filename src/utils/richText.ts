import type { RichTextBlock, RichTextBlockElement, RichTextElement } from "@slack/types";

function styleWrap(
  text: string,
  style?: { bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean }
): string {
  if (!text || !style) return text;
  if (style.code) return `\`${text}\``;
  let out = text;
  if (style.bold) out = `*${out}*`;
  if (style.italic) out = `_${out}_`;
  if (style.strike) out = `~${out}~`;
  return out;
}

function elementToMrkdwn(el: RichTextElement): string {
  switch (el.type) {
    case "text":
      return styleWrap(el.text, el.style);
    case "link":
      return el.text ? `<${el.url}|${el.text}>` : `<${el.url}>`;
    case "user":
      return `<@${el.user_id}>`;
    case "usergroup":
      return `<!subteam^${el.usergroup_id}>`;
    case "channel":
      return `<#${el.channel_id}>`;
    case "broadcast":
      return `<!${el.range}>`;
    case "emoji":
      return `:${el.name}:`;
    case "date":
      return el.fallback ?? el.format;
    case "color":
      return el.value;
    default:
      return "";
  }
}

function sectionToMrkdwn(section: { elements: RichTextElement[] }): string {
  return section.elements.map(elementToMrkdwn).join("");
}

function blockElementToMrkdwn(el: RichTextBlockElement): string {
  switch (el.type) {
    case "rich_text_section":
      return sectionToMrkdwn(el);
    case "rich_text_list":
      return el.elements
        .map((item, i) => `${el.style === "ordered" ? `${i + 1}.` : "-"} ${sectionToMrkdwn(item)}`)
        .join("\n");
    case "rich_text_quote":
      return `> ${el.elements.map(elementToMrkdwn).join("")}`;
    case "rich_text_preformatted":
      return `\`\`\`${el.elements.map(elementToMrkdwn).join("")}\`\`\``;
    default:
      return "";
  }
}

/**
 * Converts a rich_text_input's structured value (Slack's real message
 * composer, with native @-mention autocomplete for both users and bots)
 * into a plain mrkdwn string -- the same `<@ID>` syntax Slack already
 * renders as a mention in a normal `section` block. Lets quick replies keep
 * a plain string column and the existing rendering path untouched, while
 * authoring them gets the real composer instead of typing raw Slack IDs.
 */
export function richTextToMrkdwn(block: RichTextBlock): string {
  return block.elements.map(blockElementToMrkdwn).join("\n").trim();
}

/** The reverse direction, for prefilling the composer when editing an existing quick reply. */
export function plainTextToRichTextBlock(text: string): RichTextBlock {
  return {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
  };
}
