import { openai, supabase, SYSTEM_PROMPT, TMDB_API_KEY } from './config.js';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { movieRecommendationSchema, webSearchToolSchema } from './schema.js';
import DOMPurify from 'dompurify';

const CHAT_MODEL = 'gpt-4o-mini';
const EMBEDDING_MODEL = 'text-embedding-ada-002';
const MATCH_THRESHOLD = 0.60;
const MATCH_COUNT = 2;

const form = document.getElementById('movie-form');
const resultsContainer = document.getElementById('results-container');

const movies = await fetch('./movies.txt')
const text = await movies.text()

form.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevents the page from reloading on submit

    const favoriteMovie = document.getElementById('favorite-movie').value;
    const mood = document.getElementById('mood').value;
    const favoriteGenre = document.getElementById('favorite-genre').value;

    const submitBtn = document.querySelector('.submit-btn');
    submitBtn.textContent = 'Finding movies...';
    submitBtn.disabled = true;
    
    renderMessage('Analyzing your preferences...');

    console.log({ favoriteMovie, mood, favoriteGenre });
    const userInput = `My favorite movie is ${favoriteMovie}. My current mood is ${mood}. My preferred genres are ${favoriteGenre}.`;

    // Call the function to get movie recommendations based on user input
    await getMovieRecommendations(userInput);
    
    submitBtn.textContent = "Let's Go";
    submitBtn.disabled = false;
});

// Bring all function calls together
async function getMovieRecommendations(input) {
  try {
    // 1. Convert user's text query into a vector embedding
    const embedding = await createEmbedding(input);
    
    // 2. Query Supabase for semantically relevant documents
    const match = await findNearestMatch(embedding);
    
    // 3. Pass the combined context to the LLM to get a natural response
    const context = match || "No local movie context found. Please use the web_search tool or your internal knowledge to provide recommendations.";
    const responseContent = await getChatCompletion(context, input);
    await renderRecommendations(responseContent);
  } catch (error) { 
    console.error('Error in main function:', error);
    renderMessage("An error occurred while finding recommendations.");
  }
}

// Create an embedding vector representing the input text
async function createEmbedding(input) {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input
    });
    return embeddingResponse.data[0].embedding;
  } catch (error) {
    console.error('Error creating embedding:', error);
    throw error; // Rethrow to prevent proceeding with an undefined embedding
  }
}

// Query Supabase and return a semantically matching text chunk
async function findNearestMatch(embedding) {
  try {
    const { data, error } = await supabase.rpc('match_movies', {
      query_embedding: embedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT
    });
    
    if (error) throw error;
    
    // Gracefully handle the scenario where no results meet the match_threshold
    if (!data || data.length === 0) return null;
    const topMatch = data.map((match, index) => `[Rank ${index + 1}]: ${match.content}`).join('\n');
    console.log('Top matches from Supabase:', topMatch);
    return topMatch;
  } catch (error) {
    console.error('Error finding nearest match:', error);
    return null;
  }
}

// Use OpenAI to make the response conversational
async function getChatCompletion(text, query) {
  // Build messages array locally to avoid mutating global state across multiple calls
  const chatMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Context: ${text}\nQuestion: ${query}` }
  ];

  const chatConfig = {
    model: CHAT_MODEL,
    temperature: 0.5,
    frequency_penalty: 0.5,
    response_format: {
      type: "json_schema",
      json_schema: movieRecommendationSchema
    },
    tools: [webSearchToolSchema]
  };

  try {
    const response = await openai.chat.completions.create({ ...chatConfig, messages: chatMessages });
  
    let message = response.choices[0].message;

    // Check if the AI decided to call a tool
    if (message.tool_calls) {
      console.log("AI called a tool:", message.tool_calls);
      
      // 1. Add the AI's tool call to our message history
      chatMessages.push(message);

      // 2. Loop through the tool calls and execute them
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === 'web_search') {
          const args = JSON.parse(toolCall.function.arguments);
          console.log(`Executing web search for: ${args.query}`);
          
          let searchResult = `No movies found for "${args.query}".`;
          try {
            if (TMDB_API_KEY) {
              const response = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(args.query)}&api_key=${TMDB_API_KEY}`);
              const data = await response.json();
              if (data.results && data.results.length > 0) {
                const topResults = data.results.slice(0, 5).map(m => 
                  `Title: ${m.title} (${m.release_date ? m.release_date.split('-')[0] : 'N/A'})\nRating: ${m.vote_average}/10\nOverview: ${m.overview}`
                ).join('\n\n');
                searchResult = `Search results for "${args.query}":\n\n${topResults}`;
              }
            } else {
              searchResult = `Live search is currently unavailable (Missing API Key). Please generate recommendations for "${args.query}" based on the provided context or your internal knowledge.`;
            }
          } catch (error) {
            console.error("Search API error:", error);
            searchResult = `Error searching. Please generate recommendations for "${args.query}" based on the provided context or your internal knowledge.`;
          }
          
          // 3. Add the result of the tool to our message history
          chatMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: searchResult
          });
        }
      }

      // 4. Send the updated history back to OpenAI to get the final JSON response
      const finalResponse = await openai.chat.completions.create({ ...chatConfig, messages: chatMessages });
      
      message = finalResponse.choices[0].message;
    }

    return message.content;

  } catch (error) {
    console.error('Error getting chat completion:', error);
    return null;
  }
  
}

async function renderRecommendations(jsonString) {
  resultsContainer.innerHTML = ''; // Clear loading text
  
  if (!jsonString) {
    renderMessage("Failed to generate recommendations.");
    return;
  }

  try {
    // Ensure strict JSON format by stripping markdown code blocks if the LLM included them
    let cleanedString = jsonString.trim();
    if (cleanedString.startsWith("```")) {
      cleanedString = cleanedString.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }
    const data = JSON.parse(cleanedString);
    const recommendations = data.recommendations;
    
    if (!recommendations || recommendations.length === 0) {
      renderMessage("No recommendations found for your preferences.");
      return;
    }

    for (const movie of recommendations) {
      const card = document.createElement('div');
      card.className = 'movie-card';
      
      const posterUrl = await fetchMoviePoster(movie.title);
      if (posterUrl) {
        const poster = document.createElement('img');
        poster.className = 'movie-poster';
        poster.src = DOMPurify.sanitize(posterUrl);
        poster.alt = DOMPurify.sanitize(`${movie.title} Poster`);
        card.appendChild(poster);
      }

      const infoContainer = document.createElement('div');
      infoContainer.className = 'movie-info';

      const title = document.createElement('h2');
      title.className = 'movie-title';
      title.innerHTML = DOMPurify.sanitize(movie.title);
      
      const year = document.createElement('p');
      year.className = 'movie-year';
      year.innerHTML = DOMPurify.sanitize(`Released: ${movie.releaseYear}`);
      
      const content = document.createElement('p');
      content.className = 'movie-content';
      content.innerHTML = DOMPurify.sanitize(movie.content);
      
      infoContainer.appendChild(title);
      infoContainer.appendChild(year);
      infoContainer.appendChild(content);
      
      card.appendChild(infoContainer);
      
      resultsContainer.appendChild(card);
    }
  } catch (error) {
    console.error("Error parsing JSON response:", error);
    renderMessage("An error occurred while displaying recommendations.");
  }
}

async function fetchMoviePoster(title) {
  if (!TMDB_API_KEY) return null;
  try {
    const response = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&api_key=${TMDB_API_KEY}`);
    const data = await response.json();
    if (data.results && data.results.length > 0 && data.results[0].poster_path) {
      return `https://image.tmdb.org/t/p/w500${data.results[0].poster_path}`;
    }
    return null;
  } catch (error) {
    console.error("Error fetching poster from TMDB:", error);
    return null;
  }
}

function renderMessage(message) {
  resultsContainer.innerHTML = ''; // Clear loading text safely
  const p = document.createElement('p');
  p.className = 'loading-text';
  p.textContent = message;
  resultsContainer.appendChild(p);
}

async function splitDocument(document) {
  // Create a text splitter
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });
  try {
    // Split the text
    const texts = await splitter.createDocuments([document]);
    return texts;
  } catch (error) {
    console.error('Error splitting document:', error);
  }
}

// Check for duplicate text content in the table
async function checkDuplicateContent(content) {
  try {
    const { data, error } = await supabase
      .from('movies')
      .select('id')
      .eq('content', content)
      .limit(1);
    
    if (error) throw error;
    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking duplicate content:', error);
    return false;
  }
}

/* Create an embedding from each text chunk.
Store all embeddings and corresponding text in Supabase. */
async function createAndStoreEmbeddings() {
  try{
    // Authenticate a user to satisfy the RLS policy before inserting
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: import.meta.env.VITE_SUPABASE_ADMIN_EMAIL,
      password: import.meta.env.VITE_SUPABASE_ADMIN_PASSWORD
    });
    
    if (authError) {
      console.error('Authentication error:', authError.message);
      return; // Stop execution if auth fails
    }

    const chunkData = await splitDocument(text);
    
    // Best Practice: Use a sequential loop instead of Promise.all to avoid hitting API rate limits
    const dataToInsert = [];
    for (const textChunk of chunkData) {
      const isDuplicate = await checkDuplicateContent(textChunk.pageContent);
      if (isDuplicate) continue;
      
      const embedding = await createEmbedding(textChunk.pageContent);
      dataToInsert.push({ content: textChunk.pageContent, embedding });
    }
    
    if (dataToInsert.length === 0) {
      console.log('No new embeddings to store (all duplicates).');
      return;
    }
    
    // Insert content and embedding into Supabase
    const { error } = await supabase.from('movies').insert(dataToInsert);
    if (error) {
      console.error('Error inserting data into Supabase:', error);
    } else {
      console.log('Embedding and storing complete!');
    }
  } catch (error) {
    console.error('Error creating and storing embeddings:', error);
  }

}

// createAndStoreEmbeddings()
