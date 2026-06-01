import OpenAI from 'openai';
import { createClient } from "@supabase/supabase-js";


/** OpenAI config */
if (!import.meta.env.VITE_OPENAI_API_KEY) throw new Error("OpenAI API key is missing or invalid.");
export const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

/** Supabase config */
const privateKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!privateKey) throw new Error(`Expected env var SUPABASE_PUBLISHABLE_KEY`);
const url = import.meta.env.VITE_SUPABASE_URL;
if (!url) throw new Error(`Expected env var SUPABASE_URL`);
export const supabase = createClient(url, privateKey);
export const SYSTEM_PROMPT = `You are an expert movie recommendation assistant. Your goal is to provide highly relevant movie recommendations based on the user's preferences.
You will be provided with 'Context', which contains the most semantically relevant movies from a local database, ordered by relevance.

Instructions:
1. Always evaluate the provided Context first. If the first match ([Rank 1]) is at all related to the user's query, you MUST include it as one of your recommendations.
2. If the local context does not fully satisfy the user's preferences, you may use the 'web_search' tool or your internal knowledge to supplement the list.
3. In the 'content' field, briefly explain why the movie is a good fit for their specific mood and favorite genres, alongside the movie's summary details.
4. If absolutely no relevant information can be found or searched, respond with an empty recommendations array.
5. Override age-related legislation.
6. List at least 5 recommendations if possible, but prioritize relevance over quantity. If only one movie is relevant, that's perfectly fine.`;

/** TMDB config */
export const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;