import sanitizeHtml from "sanitize-html";
import he from "he";

const options: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "ul",
    "ol",
    "li",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "h3",
    "h4",
    "a",
  ],
  allowedAttributes: {
    a: ["href", "rel", "target"],
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener nofollow",
      target: "_blank",
    }),
  },
  allowedSchemes: ["http", "https", "mailto"],
};

export const sanitizeDescription = (html: string): string =>
  sanitizeHtml(html, options);

export const sanitizePlainText = (html: string): string =>
  he
    .decode(sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }))
    .trim();
