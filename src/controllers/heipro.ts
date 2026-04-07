import { Request, Response } from "express";
import axios from "axios";

const API_KEY = "AIzaSyDgEtuwmqp4BnpciS5oJH1xnNJHCnv095w";

const getPlaces = async (query: string, location: string) => {
  const url = `https://places.googleapis.com/v1/places:searchText`;

  const retries = 3;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.post(
        url,
        {
          textQuery: `${query} ${location}`,
          pageSize: 18,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": API_KEY,
            "X-Goog-FieldMask":
              "places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber",
          },
          timeout: 5000,
        },
      );

      return res.data.places;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.response?.status === 504 && i < retries - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        return null;
      }
    }
  }
};

const isRealEmail = (str: string) => {
  if (!str) return false;

  const cleaned = str.trim().toLowerCase();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleaned)) return false;

  // ❌ Reject if looks like a file
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|ico|pdf|mp4|mov)$/i.test(cleaned)) {
    return false;
  }

  // ❌ Reject URLs
  if (cleaned.includes("http") || cleaned.includes("www.")) {
    return false;
  }

  // ❌ Reject query strings
  if (cleaned.includes("?") || cleaned.includes("&")) {
    return false;
  }

  return true;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const extractEmail = (html: any) => {
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

  const emails = html.match(emailRegex);
  const cleanedEmails = emails.filter(isRealEmail);
  const uniqueEmails = [...new Set(cleanedEmails)];

  return uniqueEmails ? uniqueEmails.join(", ") : null;
};

const detectTechStack = (html: string) => {
  if (html.includes("wp-content")) return "WordPress";
  if (html.includes("shopify")) return "Shopify";
  if (html.includes("wix")) return "Wix";
  if (html.includes("squarespace")) return "Squarespace";

  return "N/A";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const analyzeWebsite = (url: string, html: any) => {
  let score = 100;
  const issues: string[] = [];
  const services: string[] = [];
  let tech: string = "";

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
        if (place.websiteUri) {
          results.push({
            name: place.displayName.text,
            website: place.websiteUri,
            phone: place.nationalPhoneNumber || "N/A",
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

export const heiproDetailsEndpoint = (req: Request, res: Response) => {
  (async () => {
    const { url } = req.query;

    const results = [];
    const urlString = url as string;

    try {
      const res = await axios.get(urlString, { timeout: 5000 });
      const analysis = analyzeWebsite(urlString, res.data);
      const email = extractEmail(res.data);

      results.push({
        email: email || "N/A",
        score: analysis.score,
        issues: analysis.issues,
        services: analysis.services,
        tech: analysis.tech,
      });
    } catch {
      results.push({
        email: "N/A",
        score: 100,
        issues: "Tool could not search site",
        services: "N/A",
        tech: "N/A",
      });
    }

    res.status(200).json(results[0]);
  })();
};

export const heiproMultiDetailsEndpoint = (req: Request, res: Response) => {
  (async () => {
    const { urlArr } = req.body;

    const arrUrl = urlArr as string[];

    const results = await arrUrl.map(async (item) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const singleResult: any[] = [];

      try {
        const res = await axios.get(item, { timeout: 5000 });

        const analysis = analyzeWebsite(item, res.data);
        const email = extractEmail(res.data);

        singleResult.push({
          email: email || "N/A",
          score: analysis.score,
          issues: analysis.issues,
          services: analysis.services,
          tech: analysis.tech,
          url: item,
        });

        return singleResult;
      } catch {
        console.warn("ignore this message");
      }
    });

    const awaitedResults = await Promise.all(results);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = [];

    awaitedResults.forEach((item) => {
      if (!item) {
        return;
      }

      data.push(...item);
    });

    const uniqueResults = [
      ...new Map(data.map((item) => [item.email, item])).values(),
    ];

    res.status(200).json(uniqueResults);
  })();
};
