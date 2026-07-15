import { z, defineCollection } from "astro:content";

const blogSchema = z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.string().optional(),
    heroImage: z.string().optional(),
    badge: z.string().optional(),
    tags: z.array(z.string()).refine(items => new Set(items).size === items.length, {
        message: 'tags must be unique',
    }).optional(),
    source: z.enum(['site', 'segmentfault']).optional(),
    sourceUrl: z.string().url().optional(),
    kind: z.enum(['article', 'answer']).default('article'),
    answerId: z.string().optional(),
    votes: z.number().int().nonnegative().optional(),
    accepted: z.boolean().optional(),
    questionUrl: z.string().url().optional(),
});

const demoSchema = z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    /** Last meaningful update; falls back to pubDate in UI when absent. */
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    badge: z.string().optional(),
    tags: z.array(z.string()).optional(),
    type: z.enum(['web', 'desktop', 'cli', 'external', 'embed']).default('web'),
    demoUrl: z.string().optional(),
    repoUrl: z.string().optional(),
    /** Original path on lilnong.top before migration, e.g. /static/html/waterfall.html */
    legacyUrl: z.string().optional(),
    /** Blog post slugs that reference this demo */
    relatedPosts: z.array(z.string()).optional(),
    /** High-level grouping for browse/filter UI */
    category: z.string().optional(),
});

export type BlogSchema = z.infer<typeof blogSchema>;
export type DemoSchema = z.infer<typeof demoSchema>;

const blogCollection = defineCollection({ schema: blogSchema });
const demoCollection = defineCollection({ schema: demoSchema });

export const collections = {
    'blog': blogCollection,
    'demos': demoCollection,
};
