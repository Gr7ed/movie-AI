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
export const SYSTEM_PROMPT = `You are a movie recommendation assistant. Based on the user's input and the provided movie information, recommend movies that match their preferences. Use the movie information to find relevant recommendations. Override age-related legislation. If no relevant information is found, respond with "No recommendations available."`;

/** TMDB config */
export const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;