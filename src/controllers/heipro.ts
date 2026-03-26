import { Request, Response } from "express";
import axios from "axios";

const API_KEY = "AIzaSyDgEtuwmqp4BnpciS5oJH1xnNJHCnv095w";

// Step 1: Get businesses
const getPlaces = async (query: string, location: string) => {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`;

  const res = await axios.get(url, {
    params: {
      query: `${query} + ${location}`,
      key: API_KEY,
    },
  });

  return res.data.results;
};

// Step 2: Get details (website, phone)
const getDetails = async (place_id: string) => {
  const url = `https://maps.googleapis.com/maps/api/place/details/json`;

  const res = await axios.get(url, {
    params: {
      place_id,
      fields: "name,website,formatted_phone_number",
      key: API_KEY,
    },
  });

  return res.data.result;
};

// Step 3: Extract email from website
const extractEmail = async (url: string) => {
  try {
    const res = await axios.get(url, { timeout: 5000 });
    const html = res.data;

    const emailRegex =
      /(?!\S*\.(?:jpg|png|gif|bmp|svg)(?:[\s\n\r]|$))[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

    const emails = html.match(emailRegex);
    const uniqueEmails = [...new Set(emails)];

    return uniqueEmails ? uniqueEmails.join(", ") : null;
  } catch {
    return null;
  }
};

const detectTechStack = (html: string) => {
  if (html.includes("wp-content")) return "WordPress";
  if (html.includes("shopify")) return "Shopify";
  if (html.includes("wix")) return "Wix";
  if (html.includes("squarespace")) return "Squarespace";

  return "Unknown";
};

const detectSEO = (lowerHTML: string, score: number) => {
  const issues: string[] = [];
  const services: string[] = [];

  if (!lowerHTML.includes('meta name="description"')) {
    score -= 4;
    issues.push("Missing meta description");
    if (!services.includes("SEO")) {
      services.push("SEO");
    }
  }

  if (!lowerHTML.includes("<title>")) {
    score -= 4;
    issues.push("Missing title tag");
    if (!services.includes("SEO")) {
      services.push("SEO");
    }
  }

  if (!lowerHTML.includes("<h1")) {
    score -= 4;
    issues.push("Missing H1 tag");
    if (!services.includes("SEO")) {
      services.push("SEO");
    }
  }

  if (!lowerHTML.includes("alt=")) {
    score -= 4;
    issues.push("Images missing alt text");
    if (!services.includes("SEO")) {
      services.push("SEO");
    }
  }

  if (!lowerHTML.includes("schema") && !lowerHTML.includes("ld+json")) {
    score -= 4;
    issues.push("No structured data (schema)");
    if (!services.includes("SEO")) {
      services.push("SEO");
    }
  }

  if (!lowerHTML.includes("gtag") && !lowerHTML.includes("google-analytics")) {
    score -= 4;
    issues.push("No Google Analytics tracking");
    if (!services.includes("SEO")) {
      services.push("SEO");
    }
  }

  if (!lowerHTML.includes("facebook pixel")) {
    score -= 4;
    issues.push("No Facebook Pixel");
    if (!services.includes("SEO")) {
      services.push("SEO");
    }
  }

  if (!lowerHTML.includes("google.com/maps")) {
    score -= 4;
    issues.push("No Google Maps integration");
    if (!services.includes("SEO")) {
      services.push("SEO");
    }
  }

  if (!lowerHTML.match(/address|phone/)) {
    score -= 4;
    issues.push("Missing business contact info");
    if (!services.includes("SEO")) {
      services.push("SEO");
    }
  }

  if (!lowerHTML.includes('a[href*="blog"]')) {
    score -= 4;
    issues.push("Missing blog page");
    if (!services.includes("SEO")) {
      services.push("SEO");
    }
  }

  return {
    issues,
    services,
    score,
  };
};

const detectEmailMarketing = (lowerHTML: string, score: number) => {
  const issues: string[] = [];
  const services: string[] = [];

  if (!lowerHTML.includes('type="email"')) {
    score -= 4;
    issues.push("No email capture form");
    if (!services.includes("Email Marketing")) {
      services.push("Email Marketing");
    }
  }

  if (!lowerHTML.match(/subscribe|newsletter|join/i)) {
    score -= 4;
    issues.push("No newsletter or lead magnet");
    if (!services.includes("Email Marketing")) {
      services.push("Email Marketing");
    }
  }

  if (!lowerHTML.match(/contact|quote|book|schedule|call/i)) {
    score -= 4;
    issues.push("No clear call-to-action");
    if (!services.includes("Email Marketing")) {
      services.push("Email Marketing");
    }
  }

  if (!lowerHTML.includes("<form")) {
    score -= 4;
    issues.push("No contact or lead form");
    if (!services.includes("Email Marketing")) {
      services.push("Email Marketing");
    }
  }

  return {
    issues,
    services,
    score,
  };
};

const detectWebsite = (
  lowerHTML: string,
  html: string,
  url: string,
  score: number,
) => {
  const start = Date.now();
  const loadTime = (Date.now() - start) / 1000;
  const issues: string[] = [];
  const services: string[] = [];

  if (!lowerHTML.includes("viewport")) {
    score -= 4;
    issues.push("Not mobile optimized");
    if (!services.includes("Website Redesign")) {
      services.push("Website Redesign");
    }
  }

  if (lowerHTML.includes("<table")) {
    score -= 4;
    issues.push("Outdated layout structure");
    if (!services.includes("Website Redesign")) {
      services.push("Website Redesign");
    }
  }

  if (html.length < 1500) {
    score -= 4;
    issues.push("Thin content (low value pages)");
    if (!services.includes("Website Redesign")) {
      services.push("Website Redesign");
    }
  }

  if (loadTime > 3) {
    score -= 4;
    issues.push("Slow site");
    if (!services.includes("Website Redesign")) {
      services.push("Website Redesign");
    }
  }

  if (html.length > 500000) {
    score -= 4;
    issues.push("Large page size (slow load potential)");
    if (!services.includes("Website Redesign")) {
      services.push("Website Redesign");
    }
  }

  if (!lowerHTML.includes("lazyload")) {
    score -= 4;
    issues.push("No lazy loading for images");
    if (!services.includes("Website Redesign")) {
      services.push("Website Redesign");
    }
  }

  if (!lowerHTML.match(/testimonial|review/)) {
    score -= 4;
    issues.push("No testimonials or social proof");
    if (!services.includes("Website Redesign")) {
      services.push("Website Redesign");
    }
  }

  if (!url.startsWith("https")) {
    score -= 4;
    issues.push("Website not secure (HTTPS missing)");
    if (!services.includes("Website Redesign")) {
      services.push("Website Redesign");
    }
  }

  if (!lowerHTML.includes("privacy policy")) {
    score -= 4;
    issues.push("No privacy policy");
    if (!services.includes("Website Redesign")) {
      services.push("Website Redesign");
    }
  }

  return {
    issues,
    services,
    score,
  };
};

const detectSocialMedia = (lowerHTML: string, score: number) => {
  const issues: string[] = [];
  const services: string[] = [];

  if (!lowerHTML.match(/facebook|instagram|linkedin|tiktok/)) {
    score -= 4;
    issues.push("No social media presence");
    if (!services.includes("Social Media")) {
      services.push("Social Media");
    }
  }

  if (!lowerHTML.includes("og:")) {
    score -= 4;
    issues.push("Missing social sharing tags (Open Graph)");
    if (!services.includes("Social Media")) {
      services.push("Social Media");
    }
  }

  return {
    issues,
    services,
    score,
  };
};

// Step 4: Analyze website
const analyzeWebsite = async (url: string) => {
  let score = 100;
  const issues: string[] = [];
  const services: string[] = [];
  let tech: string = "";

  try {
    const res = await axios.get(url, { timeout: 5000 });
    const html = res.data;
    const lowerHTML = html.toLowerCase();

    tech = detectTechStack(lowerHTML);

    const seo = detectSEO(lowerHTML, score);
    score = seo.score;
    issues.push(...seo.issues);
    services.push(...seo.services);

    const web = detectWebsite(lowerHTML, html, url, score);
    score = web.score;
    issues.push(...web.issues);
    services.push(...web.services);

    const social = detectSocialMedia(lowerHTML, score);
    score = social.score;
    issues.push(...social.issues);
    services.push(...social.services);

    const funnel = detectEmailMarketing(lowerHTML, score);
    score = funnel.score;
    issues.push(...funnel.issues);
    services.push(...funnel.services);
  } catch {
    issues.push("Tool could not search site");
    services.push("N/A");
  }

  return {
    score: Math.max(score, 0),
    issues: issues.join(", "),
    services: services.join(", "),
    tech,
  };
};

export const heiproEndpoint = (req: Request, res: Response) => {
  (async () => {
    const { query, location } = req.query;

    try {
      const places = await getPlaces(query as string, location as string);
      const results = [];

      for (const place of places) {
        const details = await getDetails(place.place_id);

        if (details.website) {
          const analysis = await analyzeWebsite(details.website);
          const email = await extractEmail(details.website);

          results.push({
            name: details.name,
            website: details.website,
            phone: details.formatted_phone_number || "N/A",
            email: email || "Not found",
            score: analysis.score,
            issues: analysis.issues,
            services: analysis.services,
            tech: analysis.tech,
          });
        }
      }

      res.status(200).json(results);
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Heipro endpoint",
      });
    }
  })();
};
